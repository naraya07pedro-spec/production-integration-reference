import assert from "node:assert/strict";
import test from "node:test";
import {HttpError,TransientError,isRetryable,withRetry} from "../src/retry.js";
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
