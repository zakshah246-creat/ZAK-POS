import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8080);
const DATA=path.join(__dirname,'data.json');
const plans={monthly:{name:'Monthly',price:5000,days:30},yearly:{name:'Yearly',price:50000,days:365}};
let db={orders:{},licenses:{}};
try{db=JSON.parse(fs.readFileSync(DATA,'utf8'));}catch{}
function save(){fs.writeFileSync(DATA,JSON.stringify(db,null,2));}
function json(res,status,obj){res.status(status).json(obj)}
function license(deviceId){return db.licenses[deviceId]||null}
function active(deviceId){const l=license(deviceId);return !!(l&&l.expiresAt>Date.now())}
function token(deviceId){return crypto.createHash('sha256').update(deviceId+'|ZAKPOS|'+(process.env.EASYPAISA_MERCHANT_ID||'')).digest('hex')}

const app=express(); app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));
app.get('/health',(req,res)=>json(res,200,{ok:true,service:'ZAK POS License Server'}));
app.get('/api/subscription/status/:deviceId',(req,res)=>{
  const id=req.params.deviceId; const l=license(id); const trial=l?.trialEndsAt||null;
  json(res,200,{active:active(id),expiresAt:l?.expiresAt||null,plan:l?.plan||null,trialEndsAt:trial});
});
app.post('/api/subscription/order',(req,res)=>{
  const {deviceId,plan}=req.body||{};
  if(!deviceId||!plans[plan]) return json(res,400,{error:'deviceId and plan are required'});
  const p=plans[plan];
  const orderId='ZAK-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex').toUpperCase();
  db.orders[orderId]={
    orderId,deviceId,plan,amount:p.price,currency:'PKR',
    status:'PENDING',createdAt:Date.now()
  };
  save();
  json(res,200,{
    orderId,amount:p.price,plan:p.name,currency:'PKR',
    paymentNumber:process.env.EASYPAISA_PAYMENT_NUMBER||'',
    status:'PENDING',
    checkoutUrl:process.env.EASYPAISA_CHECKOUT_URL||null,
    message:'Use the configured Easypaisa merchant checkout. Do not activate from a browser callback alone.'
  });
});

app.get('/api/subscription/order/:orderId',(req,res)=>{
  const o=db.orders[req.params.orderId];
  if(!o)return json(res,404,{error:'Unknown order'});
  json(res,200,{orderId:o.orderId,deviceId:o.deviceId,plan:o.plan,amount:o.amount,status:o.status,transactionId:o.transactionId||null});
});

app.post('/api/easypaisa/callback',(req,res)=>{
  const body=req.body||{};
  const orderId=body.orderId||body.orderRefNum||body.orderRefNumber||body.OrderID;
  if(!orderId||!db.orders[orderId]) return json(res,404,{ok:false,error:'Unknown order'});
  const order=db.orders[orderId];
  order.callbackReceivedAt=Date.now();
  order.gatewayPayload=body;
  // A callback is only recorded here. Production activation must happen after
  // server-to-server transaction verification with Easypaisa.
  order.status='CALLBACK_RECEIVED';
  save();
  json(res,200,{ok:true,received:true});
});

app.post('/api/admin/verify-payment',(req,res)=>{
  const secret=req.headers['x-zak-admin-secret'];
  if(!process.env.ZAK_ADMIN_SECRET || secret!==process.env.ZAK_ADMIN_SECRET)
    return json(res,401,{error:'Unauthorized'});
  const {orderId,transactionId}=req.body||{};
  const order=db.orders[orderId];
  if(!order)return json(res,404,{error:'Unknown order'});
  if(!transactionId)return json(res,400,{error:'transactionId is required'});

  // This endpoint is the finalization hook. In production, call the official
  // Easypaisa transaction inquiry/verification API BEFORE reaching this point.
  order.status='PAID';
  order.transactionId=transactionId;
  const p=plans[order.plan];
  const old=db.licenses[order.deviceId];
  const start=Math.max(Date.now(),old?.expiresAt||0);
  db.licenses[order.deviceId]={
    deviceId:order.deviceId,plan:order.plan,
    expiresAt:start+p.days*86400000,
    activatedAt:Date.now(),transactionId
  };
  save();
  json(res,200,{ok:true,active:true,expiresAt:db.licenses[order.deviceId].expiresAt,plan:order.plan});
});

app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log(`ZAK POS License Server listening on ${PORT}`));
