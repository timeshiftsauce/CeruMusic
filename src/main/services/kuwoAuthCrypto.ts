// @ts-nocheck
import { Buffer } from 'buffer'

const KW_PC1 = [56,48,40,32,24,16,8,0,57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,
  62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,60,52,44,36,28,20,12,4,27,19,11,3];
const KW_PC2 = [13,16,10,23,0,4,-1,-1,2,27,14,5,20,9,-1,-1,22,18,11,3,25,7,-1,-1,15,6,26,19,12,1,-1,-1,
  40,51,30,36,46,54,-1,-1,29,39,50,44,32,47,-1,-1,43,48,38,55,33,52,-1,-1,45,41,49,35,28,31,-1,-1];
const KW_IP = [57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,
  63,55,47,39,31,23,15,7,56,48,40,32,24,16,8,0,58,50,42,34,26,18,10,2,
  60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6];
const KW_E = [31,0,1,2,3,4,-1,-1,3,4,5,6,7,8,-1,-1,7,8,9,10,11,12,-1,-1,11,12,13,14,15,16,-1,-1,
  15,16,17,18,19,20,-1,-1,19,20,21,22,23,24,-1,-1,23,24,25,26,27,28,-1,-1,27,28,29,30,31,30,-1,-1];
const KW_P = [15,6,19,20,28,11,27,16,0,14,22,25,4,17,30,9,1,7,23,13,31,26,2,8,18,12,29,5,21,10,3,24];
const KW_FP = [39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,
  35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25,32,0,40,8,48,16,56,24];
const KW_SHIFT = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
const KW_MROT = [0n, 1048577n, 3145731n];
const KW_MASK64 = (1n << 64n) - 1n;
const KW_MASK32 = 0xffffffffn;
const KW_BIT = [];
for (let n = 0; n < 64; n++) KW_BIT.push(1n << BigInt(n));
const KW_G = [
  [14,4,3,15,2,13,5,3,13,14,6,9,11,2,0,5,4,1,10,12,15,6,9,10,1,8,12,7,8,11,7,0,
   0,15,10,5,14,4,9,10,7,8,12,3,13,1,3,6,15,12,6,11,2,9,5,0,4,2,11,14,1,7,8,13],
  [15,0,9,5,6,10,12,9,8,7,2,12,3,13,5,2,1,14,7,8,11,4,0,3,14,11,13,6,4,1,10,15,
   3,13,12,11,15,3,6,0,4,10,1,7,8,4,11,14,13,8,0,6,2,15,9,5,7,1,10,12,14,2,5,9],
  [10,13,1,11,6,8,11,5,9,4,12,2,15,3,2,14,0,6,13,1,3,15,4,10,14,9,7,12,5,0,8,7,
   13,1,2,4,3,6,12,11,0,13,5,14,6,8,15,2,7,10,8,15,4,9,11,5,9,0,14,3,10,7,1,12],
  [7,10,1,15,0,12,11,5,14,9,8,3,9,7,4,8,13,6,2,1,6,11,12,2,3,0,5,14,10,13,15,4,
   13,3,4,9,6,10,1,12,11,0,2,5,0,13,14,2,8,15,7,4,15,1,10,7,5,6,12,11,3,8,9,14],
  [2,4,8,15,7,10,13,6,4,1,3,12,11,7,14,0,12,2,5,9,10,13,0,3,1,11,15,5,6,8,9,14,
   14,11,5,6,4,1,3,10,2,12,15,0,13,2,8,5,11,8,0,15,7,14,9,4,12,7,10,9,1,13,6,3],
  [12,9,0,7,9,2,14,1,10,15,3,4,6,12,5,11,1,14,13,0,2,8,7,13,15,5,4,10,8,3,11,6,
   10,4,6,11,7,9,0,6,4,2,13,1,9,15,3,8,15,3,1,14,12,5,11,0,2,12,14,7,5,10,8,13],
  [4,1,3,10,15,12,5,0,2,11,9,6,8,7,6,9,11,4,12,15,0,3,10,5,14,13,7,8,13,14,1,2,
   13,6,14,9,4,1,2,14,11,13,5,0,1,10,8,3,0,11,3,5,9,4,15,2,7,8,12,15,10,7,6,12],
  [13,7,10,0,6,9,5,15,8,4,3,10,11,14,12,5,2,11,9,6,15,12,0,3,4,1,14,13,1,2,7,8,
   1,2,12,15,10,4,0,3,13,14,6,9,7,8,9,6,15,1,5,12,3,10,14,5,8,7,11,0,4,13,2,11]
];
function kwPermute(table, n, val) {
  let out = 0n;
  for (let idx = 0; idx < n; idx++) {
    const t = table[idx];
    if (t >= 0 && (KW_BIT[t] & val) !== 0n) out |= KW_BIT[idx];
  }
  return out;
}
function kwKeySchedule(keyBytes, decryptMode) {
  let j2 = 0n;
  for (let i = 0; i < 8; i++) j2 |= BigInt(keyBytes[i] & 0xff) << BigInt(i * 8);
  const sub = new Array(16);
  let jA = kwPermute(KW_PC1, 56, j2);
  for (let r = 0; r < 16; r++) {
    const m = KW_MROT[KW_SHIFT[r]];
    const s = BigInt(KW_SHIFT[r]);
    jA = (((jA & (~m & KW_MASK64)) >> s) | ((m & jA) << (28n - s))) & KW_MASK64;
    sub[r] = kwPermute(KW_PC2, 64, jA);
  }
  if (decryptMode) for (let i = 0; i < 8; i++) { const t = sub[i]; sub[i] = sub[15 - i]; sub[15 - i] = t; }
  return sub;
}
function kwDesBlock(sub, blk) {
  let p = kwPermute(KW_IP, 64, blk);
  let s0 = p & KW_MASK32;
  let s1 = (p >> 32n) & KW_MASK32;
  for (let r = 0; r < 16; r++) {
    let rr = kwPermute(KW_E, 64, s1);
    rr ^= sub[r];
    let u = 0n;
    for (let i = 7; i >= 0; i--) {
      const t = Number((rr >> BigInt(i * 8)) & 0xffn);
      u <<= 4n;
      u |= BigInt(KW_G[i][t]);
    }
    rr = kwPermute(KW_P, 32, u);
    const q = s0;
    s0 = s1;
    s1 = (q ^ rr) & KW_MASK32;
  }
  let out = ((s0 << 32n) & KW_MASK64) | (s1 & KW_MASK32);
  return kwPermute(KW_FP, 64, out);
}
// 加密: ECB, 每块小端装配, 末尾恒追加由 len%8 字节构成的尾块
function kwEncrypt(bytes, keyStr) {
  const sub = kwKeySchedule(Buffer.from(keyStr || 'ylzsxkwm', 'ascii'));
  const n = bytes.length;
  const full = (n / 8) | 0;
  const blocks = [];
  for (let i = 0; i < full; i++) {
    let v = 0n;
    for (let j = 0; j < 8; j++) v |= BigInt(bytes[i * 8 + j] & 0xff) << BigInt(j * 8);
    blocks.push(kwDesBlock(sub, v));
  }
  let v = 0n;
  const rem = n % 8;
  for (let j = 0; j < rem; j++) v |= BigInt(bytes[full * 8 + j] & 0xff) << BigInt(j * 8);
  blocks.push(kwDesBlock(sub, v));
  const out = Buffer.alloc(blocks.length * 8);
  for (let i = 0; i < blocks.length; i++)
    for (let j = 0; j < 8; j++) out[i * 8 + j] = Number((blocks[i] >> BigInt(j * 8)) & 0xffn);
  return out;
}
const KW_B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function kwB64encode(buf) {
  let out = '';
  for (let i = 0; i < buf.length; i += 3) {
    const n = buf.length - i;
    const b0 = buf[i], b1 = n > 1 ? buf[i + 1] : 0, b2 = n > 2 ? buf[i + 2] : 0;
    out += KW_B64[b0 >> 2] + KW_B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += n > 1 ? KW_B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += n > 2 ? KW_B64[b2 & 63] : '=';
  }
  return out;
}
const KW_B64REV = (() => { const m = {}; for (let i = 0; i < 64; i++) m[KW_B64[i]] = i; return m; })();
function kwB64decode(str) {
  const s = String(str).replace(/=+$/, '');
  const out = [];
  for (let i = 0; i < s.length; i += 4) {
    const c0 = KW_B64REV[s[i]], c1 = KW_B64REV[s[i + 1]] || 0;
    const c2 = i + 2 < s.length ? KW_B64REV[s[i + 2]] : 0;
    const c3 = i + 3 < s.length ? KW_B64REV[s[i + 3]] : 0;
    out.push((c0 << 2) | (c1 >> 4));
    if (i + 2 < s.length) out.push(((c1 & 15) << 4) | (c2 >> 2));
    if (i + 3 < s.length) out.push(((c2 & 3) << 6) | c3);
  }
  return Buffer.from(out);
}
// 解密: ECB, 反转子密钥, 仅处理整块
function kwDecrypt(bytes, keyStr) {
  const sub = kwKeySchedule(Buffer.from(keyStr, 'ascii'), true);
  const full = (bytes.length / 8) | 0;
  const out = Buffer.alloc(full * 8);
  for (let i = 0; i < full; i++) {
    let v = 0n;
    for (let j = 0; j < 8; j++) v |= BigInt(bytes[i * 8 + j] & 0xff) << BigInt(j * 8);
    const b = kwDesBlock(sub, v);
    for (let j = 0; j < 8; j++) out[i * 8 + j] = Number((b >> BigInt(j * 8)) & 0xffn);
  }
  return out;
}
// 明文参数串 -> q 参数 (DES + Base64)
function kwMakeQ(plain, keyStr) {
  return kwB64encode(kwEncrypt(Buffer.from(plain, 'utf8'), keyStr || 'ylzsxkwm'));
}

export { kwMakeQ, kwDecrypt, kwB64decode }
