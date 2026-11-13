// Public, dependency-free guards for a disposable reviewer Docker session.
export function isLocalDockerEndpoint(endpoint) {
 const value=String(endpoint??"").trim();
 return value.startsWith("unix://")||value.startsWith("npipe://")||
  /^tcp:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):[0-9]{1,5}$/.test(value);
}

export function parseLoopbackPublishedPort(output) {
 const lines=String(output??"").trim().split(/\r?\n/).filter(Boolean);
 if(lines.length!==1)throw new Error("Expected one Docker port bound to 127.0.0.1");
 const match=/^127\.0\.0\.1:([0-9]+)$/.exec(lines[0]);
 if(!match)throw new Error("Docker published port is not loopback-only");
 const port=Number(match[1]);
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid Docker published port");
 return port;
}
