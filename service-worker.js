/* Apontamento de Frota — service worker (offline)
 * - Telas (index.html): tenta a rede por até 4 s; sem sinal/sinal ruim usa a cópia guardada.
 * - Bibliotecas do Firebase e fontes: guardadas na primeira vez e servidas do celular depois.
 * - Dados (Firestore/Storage/login/Power Automate): nunca passam por aqui.
 * Para forçar atualização nos aparelhos, aumente a versão abaixo. */
var VERSION = "af-v2";
var SHELL = ["./", "index.html", "manifest.json"];
var CDN = [
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js",
  "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"
];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){
    var jobs = SHELL.map(function(u){ return c.add(u).catch(function(){}); })
      .concat(CDN.map(function(u){ return c.add(new Request(u, { mode:"no-cors" })).catch(function(){}); }));
    return Promise.all(jobs);
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k!==VERSION; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

function networkFirst(req, ms){
  return new Promise(function(resolve){
    var done = false;
    var timer = setTimeout(function(){
      caches.match(req, { ignoreSearch:true }).then(function(hit){ if(hit && !done){ done = true; resolve(hit); } });
    }, ms);
    fetch(req).then(function(res){
      if(done){ /* cópia antiga já foi servida; só atualiza o cache */ }
      var copy = res.clone();
      caches.open(VERSION).then(function(c){ c.put(req, copy); });
      if(!done){ done = true; clearTimeout(timer); resolve(res); }
    }).catch(function(){
      clearTimeout(timer);
      if(done) return;
      caches.match(req, { ignoreSearch:true }).then(function(hit){
        done = true;
        resolve(hit || caches.match("index.html") || new Response("Sem conexão", { status:503 }));
      });
    });
  });
}

function cacheFirst(req){
  return caches.match(req).then(function(hit){
    if(hit) return hit;
    return fetch(req).then(function(res){
      var copy = res.clone();
      caches.open(VERSION).then(function(c){ c.put(req, copy); });
      return res;
    });
  });
}

self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;
  var url = new URL(req.url);
  if(url.origin === self.location.origin){
    e.respondWith(networkFirst(req, 4000));
    return;
  }
  if(url.hostname === "www.gstatic.com" || url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com"){
    e.respondWith(cacheFirst(req));
  }
});
