const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const libsignalDir = path.join(__dirname, 'node_modules', 'libsignal');
const srcDir = path.join(libsignalDir, 'src');

if (!fs.existsSync(srcDir)) {
  fs.mkdirSync(srcDir, { recursive: true });
}

// 1. crypto.js (ESM export format)
const cryptoJsContent = `import crypto from 'crypto';

export function calculateMAC(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

export function verifyMAC(key, data, mac, length) {
  const calculated = calculateMAC(key, data).slice(0, length || 8);
  return crypto.timingSafeEqual(calculated, mac);
}

export function deriveSecrets(masterSecret, salt, info) {
  const prk = crypto.createHmac('sha256', salt).update(masterSecret).digest();
  const infoBuffer = Buffer.isBuffer(info) ? info : Buffer.from(info || '');
  const okm = [];
  let previous = Buffer.alloc(0);
  for (let i = 1; i <= 3; i++) {
    previous = crypto.createHmac('sha256', prk).update(Buffer.concat([previous, infoBuffer, Buffer.from([i])])).digest();
    okm.push(previous);
  }
  const concat = Buffer.concat(okm);
  return [concat.slice(0, 32), concat.slice(32, 64), concat.slice(64, 96)];
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

export function calculateAgreement(pub, priv) {
  return crypto.diffieHellman({ privateKey: priv, publicKey: pub });
}

export function calculateSignature(privKey, message) {
  return crypto.sign(null, message, privKey);
}

export function verifySignature(pubKey, message, signature) {
  return crypto.verify(null, message, pubKey, signature);
}

export function generateKeyPair() {
  const kp = crypto.generateKeyPairSync('x25519');
  return {
    pubKey: Buffer.concat([Buffer.from([0x05]), kp.publicKey.export({ type: 'spki', format: 'der' })]),
    privKey: kp.privateKey.export({ type: 'pkcs8', format: 'der' })
  };
}

export default { calculateAgreement, calculateSignature, verifySignature, generateKeyPair };
`;

fs.writeFileSync(path.join(srcDir, 'curve.js'), curveJsContent);

// 3. root index.js em libsignal com ambos Curve e curve (maiusculo e minusculo)
const indexJsContent = `
const crypto = require('crypto');

const Curve = {
  calculateAgreement: (pub, priv) => crypto.diffieHellman({ privateKey: priv, publicKey: pub }),
  calculateSignature: (privKey, message) => crypto.sign(null, message, privKey),
  verifySignature: (pubKey, message, signature) => crypto.verify(null, message, pubKey, signature),
  generateKeyPair: () => {
    const kp = crypto.generateKeyPairSync('x25519');
    return {
      pubKey: Buffer.concat([Buffer.from([0x05]), kp.publicKey.export({ type: 'spki', format: 'der' })]),
      privKey: kp.privateKey.export({ type: 'pkcs8', format: 'der' })
    };
  }
};

module.exports = {
  Curve,
  curve: Curve,
  calculateMAC: (key, data) => crypto.createHmac('sha256', key).update(data).digest(),
  verifyMAC: (key, data, mac, length) => crypto.timingSafeEqual(crypto.createHmac('sha256', key).update(data).digest().slice(0, length || 8), mac)
};
`;

fs.writeFileSync(path.join(libsignalDir, 'index.js'), indexJsContent);

// Atualizar scripts em package.json
const pkgPath = path.join(__dirname, 'package.json');
let pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts.postinstall = "node fix_libsignal.js";
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

console.log('✅ fix_libsignal.js atualizado com Curve e curve (maiusculo e minusculo)!');
