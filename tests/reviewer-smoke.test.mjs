import test from "node:test";
import assert from "node:assert/strict";
import {isLocalDockerEndpoint,parseLoopbackPublishedPort} from "../scripts/reviewer-smoke-guards.mjs";

test("accept only local Docker socket or explicit loopback TCP contexts",()=>{
 for(const endpoint of ["unix:///var/run/docker.sock","unix:///run/user/1000/docker.sock",
                       "npipe:////./pipe/dockerDesktopLinuxEngine","tcp://127.0.0.1:2375","tcp://localhost:2376"])
  assert.equal(isLocalDockerEndpoint(endpoint),true,endpoint);
 for(const endpoint of ["ssh://prod-server","tcp://10.0.1.22:2375","tcp://0.0.0.0:2375",
                       "https://example.com:443","","npipe://","https://127.0.0.1:2376"])
  assert.equal(isLocalDockerEndpoint(endpoint),false,endpoint);
});
test("Docker port must be a single valid IPv4 loopback binding",()=>{
 for(const [input,want] of [["127.0.0.1:49152",49152],["127.0.0.1:5432\n",5432]])
  assert.equal(parseLoopbackPublishedPort(input),want);
 for(const input of ["0.0.0.0:5432",":::5432","[::]:5432","192.168.1.4:5432",
                     "127.0.0.1:0","127.0.0.1:65536","127.0.0.1:5432\n127.0.0.1:5433",""])
  assert.throws(()=>parseLoopbackPublishedPort(input));
});
