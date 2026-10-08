// Unit test for the URL privacy filter. Run: node extension/tests/privacy.test.mjs
import { prepareUrl } from '../lib/privacy.js'
import assert from 'node:assert'
const S = { trusted: ['mybank.example'], redactQuery: false }
assert.equal(prepareUrl('chrome://settings', S).skip, 'not-web')
assert.equal(prepareUrl('file:///C:/x.html', S).skip, 'not-web')
for (const u of ['http://localhost:5173/', 'http://127.0.0.1/', 'http://192.168.1.1/login', 'http://10.0.0.5/', 'http://172.20.1.1/', 'http://printer.local/', 'http://[::1]/'])
  assert.equal(prepareUrl(u, S).skip, 'private', u)
assert.equal(prepareUrl('https://login.mybank.example/x', S).skip, 'trusted')
const a = prepareUrl('https://alice:hunter2@paypal.com.evil.xyz/verify#otp=123456', S)
assert.ok(!a.send.includes('hunter2') && !a.send.includes('alice') && !a.send.includes('123456'), a.send)
assert.ok(a.send.includes('@paypal.com.evil.xyz'), a.send)
const q = prepareUrl('https://evil.xyz/login?email=a@b.com&token=abc', { ...S, redactQuery: true })
assert.ok(!q.send.includes('a%40b.com') && !q.send.includes('abc') && q.send.includes('email=x'), q.send)
assert.equal(prepareUrl('https://evil.xyz/login?token=abc', S).send, 'https://evil.xyz/login?token=abc')
assert.ok(!prepareUrl('http://198.51.100.23:8080/upi', S).skip)
console.log('privacy filter: all assertions passed')
