const crypto = require('crypto');

function generateKeyPair() {
  const kp = crypto.generateKeyPairSync('x25519');
  const privKey = kp.privateKey.export({ type: 'pkcs8', format: 'der' }).slice(-32);
  const pubKey = Buffer.concat([Buffer.from([0x05]), kp.publicKey.export({ type: 'spki', format: 'der' }).slice(-32)]);
  return { pubKey, privKey };
}

function calculateAgreement(pub, priv) {
  const cleanPub = pub.length === 33 ? pub.slice(1) : pub;
  const cleanPriv = priv.length === 32 ? priv : priv.slice(-32);

  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), cleanPriv]),
    format: 'der',
    type: 'pkcs8'
  });

  const pubKeyObj = crypto.createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), cleanPub]),
    format: 'der',
    type: 'spki'
  });

  return crypto.diffieHellman({ privateKey: privKeyObj, publicKey: pubKeyObj });
}

function calculateSignature(privKey, message) {
  const cleanPriv = privKey.length === 32 ? privKey : privKey.slice(-32);
  const privKeyObj = crypto.createPrivateKey({
    key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), cleanPriv]),
    format: 'der',
    type: 'pkcs8'
  });
  return crypto.sign(null, message, privKeyObj);
}

function verifySignature(pubKey, message, signature) {
  const cleanPub = pubKey.length === 33 ? pubKey.slice(1) : pubKey;
  const pubKeyObj = crypto.createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), cleanPub]),
    format: 'der',
    type: 'spki'
  });
  return crypto.verify(null, message, pubKeyObj, signature);
}

const alice = generateKeyPair();
const bob = generateKeyPair();

const sharedA = calculateAgreement(bob.pubKey, alice.privKey);
const sharedB = calculateAgreement(alice.pubKey, bob.privKey);

console.log('Shared A:', sharedA.toString('hex'));
console.log('Shared B:', sharedB.toString('hex'));
console.log('Chaves iguais:', sharedA.equals(sharedB));
