const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
let clock=Date.parse('2026-12-23T22:59:59Z');
const metadata={application:'napi',napi_owner_id:'shared-owner',napi_access_until:'2026-12-23T23:00:00Z'};
const session={access_token:'a.b.c',refresh_token:'refresh',expires_at:Date.parse('2026-12-24T01:00:00Z')/1000,user:{id:'ferenc',app_metadata:metadata}};
const storage=new Map();let body;
const context=vm.createContext({window:{},Date:class extends Date{static now(){return clock;}},JSON,setTimeout,
 localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
 fetch:async(_url,options)=>{body=JSON.parse(options.body);return{ok:true,json:async()=>session};}
});
vm.runInContext(fs.readFileSync('js/customer-directory.js','utf8'),context);
(async()=>{
 const directory=context.window.NapiCustomerDirectory;
 await directory.signIn('test-pin','ferenc');
 assert.equal(body.email,'ferenc@napi.diszkertek.hu');
 assert.equal((await directory.session()).user.id,'ferenc');
 clock=Date.parse('2026-12-23T23:00:00Z');
 await assert.rejects(directory.session(),/hozzáférés lejárt/);
 assert.equal(directory.hasSession(),false,'A lejárt munkamenet nem maradhat aktív.');
 await assert.rejects(directory.signIn('test-pin','ferenc'),/hozzáférés lejárt/);
 await assert.rejects(directory.signIn('test-pin','unknown'),/Ismeretlen/);
 session.user={id:'tamas'};
 await directory.signIn('test-pin');
 assert.equal(body.email,'tamas@napi.diszkertek.hu','A meglévő közös belépés változatlan.');
 const syncContext=vm.createContext({window:{NapiCustomerDirectory:{session:async()=>({...session,user:{id:'ferenc',app_metadata:metadata}})}},setTimeout,atob:()=>'',fetch:async(_url,options)=>{body=JSON.parse(options.body);return{ok:true,text:async()=>'{}'};}});
 vm.runInContext(fs.readFileSync('js/napi-sync.js','utf8'),syncContext);
 await syncContext.window.NapiCloudSync.pushConfig([]);
 assert.equal(body.p_owner_id,'shared-owner','Ferenc ugyanazt a közös adatkört használja.');
 const {pendingSubscriptions}=await import('../supabase/functions/napi-send-reminders/delivery-state.mjs');
 const devices=[{id:'ferenc',access_until:metadata.napi_access_until},{id:'tamas'}];
 assert.equal(pendingSubscriptions(devices,[],clock-1).length,2);
 assert.deepEqual(pendingSubscriptions(devices,[],clock).map(device=>device.id),['tamas'],'Lejáratkor értesítés sem küldhető Ferencnek.');
 console.log('Ferenc: külön belépés, közös adatkör, pontos lejárat és értesítésvédelem: OK');
})().catch(error=>{console.error(error);process.exitCode=1;});
