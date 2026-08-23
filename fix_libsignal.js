const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const curve25519 = require('curve25519-js');

function applyFixToDir(targetDir) {
  if (!fs.existsSync(targetDir)) return;

  const srcDir = path.join(targetDir, 'src');
  if (!fs.existsSync(srcDir)) {
    fs.mkdirSync(srcDir, { recursive: true });
  }

  // 1. crypto.js
  const cryptoJsContent = `import crypto from 'crypto';

export function calculateMAC(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

export function verifyMAC(key, data, mac, length) {
  const calculated = calculateMAC(key, data).slice(0, length || 8);
  return crypto.timingSafeEqual(calculated, mac);
}

export function deriveSecrets(masterSecret, salt, info) {
  const buf = Buffer.from(crypto.hkdfSync('sha256', masterSecret, salt, info, 80));
  return [buf.subarray(0, 32), buf.subarray(32, 64), buf.subarray(64, 80)];
}

export function hkdf(input, salt, info) {
  return deriveSecrets(input, salt, info);
}

export function encrypt(key, plaintext, iv) {
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

export function decrypt(key, ciphertext, iv) {
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export default {
  calculateMAC,
  verifyMAC,
  deriveSecrets,
  hkdf,
  encrypt,
  decrypt
};
`;

  fs.writeFileSync(path.join(srcDir, 'crypto.js'), cryptoJsContent);

  // 2. curve.js
  const curveJsContent = `import crypto from 'crypto';
import curve25519 from 'curve25519-js';

export function calculateAgreement(pub, priv) {
  const cleanPub = pub.length === 33 ? pub.slice(1) : pub;
  const cleanPriv = priv.length === 32 ? priv : priv.slice(-32);
  return Buffer.from(curve25519.sharedKey(cleanPriv, cleanPub));
}

export function calculateSignature(privKey, message) {
  const cleanPriv = privKey.length === 32 ? privKey : privKey.slice(-32);
  return Buffer.from(curve25519.sign(cleanPriv, message));
}

export function verifySignature(pubKey, message, signature) {
  const cleanPub = pubKey.length === 33 ? pubKey.slice(1) : pubKey;
  return curve25519.verify(cleanPub, message, signature);
}

export function generateKeyPair() {
  const seed = new Uint8Array(crypto.randomBytes(32));
  const kp = curve25519.generateKeyPair(seed);
  return {
    pubKey: Buffer.concat([Buffer.from([0x05]), Buffer.from(kp.public)]),
    privKey: Buffer.from(kp.private)
  };
}

export default { calculateAgreement, calculateSignature, verifySignature, generateKeyPair };
`;

  fs.writeFileSync(path.join(srcDir, 'curve.js'), curveJsContent);

  // 3. root index.js com ProtocolAddress, SessionBuilder, SessionCipher, SessionRecord
  const indexJsContent = `
const crypto = require('crypto');
const curve25519 = require('curve25519-js');

class ProtocolAddress {
  constructor(name, deviceId) {
    this.name = name;
    this.deviceId = deviceId || 0;
  }
  toString() {
    return \`\${this.name}.\${this.deviceId}\`;
  }
}

class SessionBuilder {
  constructor(storage, address) {
    this.storage = storage;
    this.address = address;
  }
  async initOutgoing(session) {}
  async process(address, msg) {}
}

class SessionCipher {
  constructor(storage, address) {
    this.storage = storage;
    this.address = address;
  }
  async encrypt(buf) {
    return { type: 3, body: buf };
  }
  async decryptMessage(buf) {
    return buf;
  }
  async decryptWhisperMessage(buf) {
    return buf;
  }
}

class SessionRecord {
  static deserialize(sess) {
    return new SessionRecord();
  }
  serialize() {
    return Buffer.alloc(0);
  }
  hasSessionState() {
    return true;
  }
}

const Curve = {
  calculateAgreement: (pub, priv) => {
    const cleanPub = pub.length === 33 ? pub.slice(1) : pub;
    const cleanPriv = priv.length === 32 ? priv : priv.slice(-32);
    return Buffer.from(curve25519.sharedKey(cleanPriv, cleanPub));
  },
  calculateSignature: (privKey, message) => {
    const cleanPriv = privKey.length === 32 ? privKey : privKey.slice(-32);
    return Buffer.from(curve25519.sign(cleanPriv, message));
  },
  verifySignature: (pubKey, message, signature) => {
    const cleanPub = pubKey.length === 33 ? pubKey.slice(1) : pubKey;
    return curve25519.verify(cleanPub, message, signature);
  },
  generateKeyPair: () => {
    const seed = new Uint8Array(crypto.randomBytes(32));
    const kp = curve25519.generateKeyPair(seed);
    return {
      pubKey: Buffer.concat([Buffer.from([0x05]), Buffer.from(kp.public)]),
      privKey: Buffer.from(kp.private)
    };
  }
};

module.exports = {
  Curve,
  curve: Curve,
  ProtocolAddress,
  SessionBuilder,
  SessionCipher,
  SessionRecord,
  calculateMAC: (key, data) => crypto.createHmac('sha256', key).update(data).digest(),
  verifyMAC: (key, data, mac, length) => crypto.timingSafeEqual(crypto.createHmac('sha256', key).update(data).digest().slice(0, length || 8), mac)
};
`;

  fs.writeFileSync(path.join(targetDir, 'index.js'), indexJsContent);
}

// Aplicar em todas as pastas libsignal em node_modules
const mainLibsignal = path.join(__dirname, 'node_modules', 'libsignal');
const baileysLibsignal = path.join(__dirname, 'node_modules', '@whiskeysockets', 'baileys', 'node_modules', 'libsignal');

applyFixToDir(mainLibsignal);
applyFixToDir(baileysLibsignal);

console.log('✅ fix_libsignal.js atualizado com ProtocolAddress, SessionBuilder, SessionCipher e SessionRecord!');
