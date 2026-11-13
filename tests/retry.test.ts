import assert from "node:assert/strict";
import test from "node:test";
import {HttpError,TransientError,isRetryable,withRetry,parseRetryAfter,MAX_RETRY_DELAY_MS} from "../src/retry.js";
for(const status of [408,429,500,502,503,599]) test("HTTP "+status+" is retryable",()=>assert.ok(isRetryable(new HttpError(status))));
for(const error of [new HttpError(400),new HttpError(600),new TypeError("bug"),new SyntaxError("bug")])
 test("does not retry "+error.name+("status" in error?error.status:""),()=>assert.equal(isRetryable(error),false));
test("transport retries, bounded exponential delay and deterministic jitter",async()=>{
 const delays:number[]=[];let calls=0;
 await assert.rejects(withRetry(async()=>{calls++;throw new TransientError();},{maxAttempts:4,baseDelayMs:100,sleep:async ms=>{delays.push(ms);},random:()=>0.5}));
 assert.equal(calls,4);assert.deepEqual(delays,[112,225,450]);
});
for(const maxAttempts of [0,-1,1.5,NaN,Infinity,6]) test("invalid attempt bound "+maxAttempts,async()=>{
 let calls=0;await assert.rejects(withRetry(async()=>{calls++;},{maxAttempts}),RangeError);assert.equal(calls,0);
});

test("Retry-After parses seconds and valid HTTP dates with strict bounds",()=>{
 const now=Date.parse("2026-11-13T12:00:00Z");
 assert.equal(parseRetryAfter("3",now),3000);
 assert.equal(parseRetryAfter("0",now),0);
 assert.equal(parseRetryAfter(new Date(now+6000).toUTCString(),now),6000);
 assert.equal(parseRetryAfter(new Date(now-2000).toUTCString(),now),0);
 assert.equal(parseRetryAfter("31",now),MAX_RETRY_DELAY_MS+1);
 assert.equal(parseRetryAfter(new Date(now+60000).toUTCString(),now),MAX_RETRY_DELAY_MS+1);
 for(const v of [null,"","-2","1.5","not-a-date","Thu, 32 Nov 2026 12:00:00 GMT"])
   assert.equal(parseRetryAfter(v,now),null);
});
test("429 honors provider delay without losing stable retry budget",async()=>{
 const delays:number[]=[];let calls=0;
 const result=await withRetry(async()=>{
   calls++;
   if(calls===1)throw new HttpError(429,3000);
   return "accepted";
 },{maxAttempts:3,baseDelayMs:100,sleep:async ms=>{delays.push(ms);},random:()=>0});
 assert.equal(result,"accepted");assert.equal(calls,2);assert.deepEqual(delays,[3000]);
});
test("provider wait over 30 seconds prevents early retries",async()=>{
 let calls=0;let sleeps=0;
 await assert.rejects(withRetry(async()=>{calls++;throw new HttpError(429,MAX_RETRY_DELAY_MS+1);},
  {sleep:async()=>{sleeps++;}}),HttpError);
 assert.equal(calls,1);assert.equal(sleeps,0);
});
