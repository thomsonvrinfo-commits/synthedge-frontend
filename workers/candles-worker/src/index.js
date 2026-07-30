const VERSION = "SYNTHEDGE_WORKER_V2";

const ALLOWED_SYMBOLS = new Set([
  "Volatility 10 Index",
  "Volatility 50 Index",
  "Volatility 75 Index",
  "Volatility 100 Index"
]);


const TIMEFRAMES = {
  M1:60,
  M5:300,
  M15:900,
  M30:1800,
  H1:3600,
  H4:14400,
  D1:86400
};


const FOLDER_MAP = {

 "Volatility 10 Index":"volatility-10",
 "Volatility 50 Index":"volatility-50",
 "Volatility 75 Index":"volatility-75",
 "Volatility 100 Index":"volatility-100"

};



export default {


async fetch(request,env){

const url = new URL(request.url);



const cors={
"Access-Control-Allow-Origin":"*",
"Access-Control-Allow-Headers":"Content-Type,Authorization",
"Access-Control-Allow-Methods":"GET,POST,PATCH,OPTIONS"
};



function json(data,status=200){

return new Response(
JSON.stringify(data),
{
status,
headers:{
"Content-Type":"application/json",
...cors
}
}
);

}



if(request.method==="OPTIONS"){
return new Response(null,{headers:cors});
}



// HEALTH

if(url.pathname==="/"){

return json({
status:"SynthEdge API online",
version:VERSION
});

}




// AUTH

if(url.pathname==="/auth/me"){

return json({

id:"demo-user",
email:"demo@synthedge.com",
name:"Demo Trader"

});

}



// PROFILE

if(url.pathname==="/profile"){

return json([]);

}



// TRADES

if(url.pathname==="/trades"){

return json([]);

}



// REPLAY

if(url.pathname==="/replay-sessions"){

return json([]);

}

// DEBUG R2 LIST

if(url.pathname==="/debug/r2"){

const listed = await env.BUCKET.list({
limit:50
});

return json({

count: listed.objects.length,

objects:
listed.objects.map(
o=>o.key
)

});

}


// CANDLES

if(url.pathname!=="/candles"){

return json({
error:"Not found",
path:url.pathname
},404);

}



const symbol=url.searchParams.get("symbol");

const timeframe=
(url.searchParams.get("timeframe")||"M1").toUpperCase();


const from=Number(
url.searchParams.get("from")
);

const to=Number(
url.searchParams.get("to")
);



if(!ALLOWED_SYMBOLS.has(symbol)){

return json({
error:"Invalid symbol",
symbol
},400);

}



if(!TIMEFRAMES[timeframe]){

return json({
error:"Invalid timeframe"
},400);

}



try{


const folder=FOLDER_MAP[symbol];


let candles=[];



const start=new Date(from*1000);

const end=new Date(to*1000);



let current=new Date(
Date.UTC(
start.getUTCFullYear(),
start.getUTCMonth(),
1
)
);



while(current<=end){


const month=
current.toISOString().slice(0,7);



const key =
`${folder}/m1/${month}.parquet`;



const file=
await env.BUCKET.get(key);



if(file){


const buffer=
await file.arrayBuffer();


const text=
await gunzip(buffer);



candles.push(
...JSON.parse(text)
);


}



current.setUTCMonth(
current.getUTCMonth()+1
);


}




candles=candles.filter(
c =>
c.timestamp>=from &&
c.timestamp<=to
);



if(timeframe!=="M1"){

candles=
aggregateCandles(
candles,
TIMEFRAMES[timeframe]
);

}




return json({

version:VERSION,
symbol,
timeframe,
count:candles.length,
candles

});


}
catch(e){

return json({

error:"worker error",
detail:String(e)

},500);

}


}


};



function aggregateCandles(candles,seconds){


const groups={};



for(const c of candles){


const bucket=
Math.floor(
c.timestamp/seconds
)*seconds;



if(!groups[bucket]){


groups[bucket]={

timestamp:bucket,
open:c.open,
high:c.high,
low:c.low,
close:c.close,
volume:c.volume

};


}
else{


let g=groups[bucket];


g.high=Math.max(g.high,c.high);

g.low=Math.min(g.low,c.low);

g.close=c.close;

g.volume+=c.volume;


}



}



return Object.values(groups)
.sort((a,b)=>a.timestamp-b.timestamp);


}



async function gunzip(buffer){


const stream=
new Blob([buffer])
.stream()
.pipeThrough(
new DecompressionStream("gzip")
);


return await new Response(stream).text();


}