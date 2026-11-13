import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {once} from "node:events";
import {FetchDownstreamClient} from "../src/http-client.js";
import {normalizeLead} from "../src/handler.js";
import {HttpError,TransientError,withRetry} from "../src/retry.js";
import {lead,immediate} from "./helpers.js";
test("real HTTP boundary forwards normalized JSON, stable key, auth and retries 429",async t=>{
 const keys:string[]=[];let calls=0;
 const server=createServer(async(req,res)=>{
   calls++; keys.push(req.headers["idempotency-key"] as string);
   assert.equal(req.headers.authorization,"Bearer local-test-only");
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   assert.equal(JSON.parse(Buffer.concat(chunks).toString()).email,"buyer@example.test");
   res.writeHead(calls===1?429:200,{"content-type":"application/json"}).end(JSON.stringify({id:"demo-remote"}));
 });
 server.listen(0,"127.0.0.1");await once(server,"listening");t.after(()=>server.close());
 const addr=server.address() as {port:number};
 const client=new FetchDownstreamClient("http://127.0.0.1:"+addr.port,"local-test-only");
 assert.deepEqual(await withRetry(()=>client.sendLead(normalizeLead(lead),"stable-key"),immediate),{externalId:"demo-remote"});
 assert.deepEqual(keys,["stable-key","stable-key"]);
});
test("transport timeout is retryable and does not become success",async t=>{
 const server=createServer((_req,res)=>{res.writeHead(200,{"content-type":"application/json"});res.flushHeaders();});
 server.listen(0,"127.0.0.1");await once(server,"listening");
 t.after(()=>{server.closeAllConnections();server.close();});
 const addr=server.address() as {port:number};
 const client=new FetchDownstreamClient("http://127.0.0.1:"+addr.port,"local-test-only",50);
 await assert.rejects(client.sendLead(normalizeLead(lead),"key"),TransientError);
});
test("HTTP errors discard sensitive response bodies",async t=>{
 const server=createServer((_req,res)=>res.writeHead(401).end("private-response"));
 server.listen(0,"127.0.0.1");await once(server,"listening");t.after(()=>server.close());
 const addr=server.address() as {port:number};
 await assert.rejects(new FetchDownstreamClient("http://127.0.0.1:"+addr.port,"local-test-only").sendLead(normalizeLead(lead),"key"),
 (e:unknown)=>e instanceof HttpError && e.status===401 && !e.message.includes("private-response"));
});


test("2xx JSON requires a nonempty string provider id; 204 may omit it",async t=>{
 const replies: Array<{status:number;body:unknown|null}>=[
   {status:200,body:{}},{status:200,body:{id:null}},
   {status:201,body:{id:123}},{status:200,body:{id:"  "}},
   {status:200,body:[]},{status:201,body:{id:"provider-ok"}},
   {status:204,body:null},
 ];
 let calls=0;
 const server=createServer((_req,res)=>{
   const entry=replies[calls++];
   if(!entry){res.writeHead(500).end();return;}
   res.writeHead(entry.status,{"content-type":"application/json"});
   if(entry.status===204)res.end();
   else res.end(JSON.stringify(entry.body));
 });
 server.listen(0,"127.0.0.1");await once(server,"listening");
 t.after(()=>server.close());
 const port=(server.address() as {port:number}).port;
 const client=new FetchDownstreamClient("http://127.0.0.1:"+port,"local-test-only");
 for(let i=0;i<5;i++){
   await assert.rejects(client.sendLead(normalizeLead(lead),"stable-key"),/Invalid downstream response/);
 }
 assert.deepEqual(await client.sendLead(normalizeLead(lead),"stable-key"),{externalId:"provider-ok"});
 assert.deepEqual(await client.sendLead(normalizeLead(lead),"stable-key"),{externalId:null});
 assert.equal(calls,replies.length);
});
