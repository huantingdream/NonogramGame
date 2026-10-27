import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, verifyLegacyPassword } from '../server/password.js';
test('native passwords use unique salts and reject wrong passwords', async () => {
  const a = await hashPassword('正确密码 123'), b = await hashPassword('正确密码 123');
  assert.notEqual(a,b); assert.equal(await verifyPassword('正确密码 123',a),true); assert.equal(await verifyPassword('incorrect',a),false);
});
test('legacy compatibility matches Firebase public reference vector, never a live account', async () => {
  // Public test vector: https://github.com/firebase/scrypt#password-hashing
  const config={algorithm:'SCRYPT',signerKey:'jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==',saltSeparator:'Bw==',rounds:8,memoryCost:14};
  const hash='lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ==';
  assert.equal(await verifyLegacyPassword('user1password',hash,'42xEC+ixf3L2lw==',config),true);
  assert.equal(await verifyLegacyPassword('incorrect',hash,'42xEC+ixf3L2lw==',config),false);
});
