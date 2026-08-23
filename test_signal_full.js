const crypto = require('crypto');

function generateKeyPair() {
  const kp = crypto.generateKeyPairSync('ed25519');
  const privKey = kp.privateKey.export({ type: 'pkcs8', format: 'der' }).slice(-32);
  const pubKey = Buffer.concat([Buffer.from([0x05]), kp.publicKey.export({ type: 'spki', format: 'der' }).slice(-32)]);
  return { pubKey, privKey };
}

function calculateSignature(privKey, message) {
  const cleanPriv = privKey.length === 32 ? privKey : privKey.slice(-32);
  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), cleanPriv]),
    format: 'der',
    type: 'pkcs8'
  });
  return crypto.sign(null, message, privKeyObj);
}

function verifySignature(pubKey, message, signature) {
  const cleanPub = pubKey.length === 33 ? pubKey.slice(1) : pubKey;
  const pubKeyObj = crypto.createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), cleanPub]),
    format: 'der',
    type: 'spki'
  });
  return crypto.verify(null, message, pubKeyObj, signature);
}

const keyPair = generateKeyPair();
const msg = Buffer.from('Mensagem de teste Baileys');
const sig = calculateSignature(keyPair.privKey, msg);
const valid = verifySignature(keyPair.pubKey, msg, sig);

console.log('Assinatura Ed25519 valida:', valid);
