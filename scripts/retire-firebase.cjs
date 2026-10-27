// One-time cutover, requiring explicit approval. All source data is retained.
// Restore by reapplying saved signIn.email settings and the saved release rulesetName.
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const {clientId,clientSecret}=require(path.join(process.env.FIREBASE_TOOLS_PATH,'lib/api.js'));
 const cfg=JSON.parse(fs.readFileSync(path.join(process.env.HOME,'.config/configstore/firebase-tools.json'),'utf8'));
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:cfg.tokens.refresh_token,client_id:clientId(),client_secret:clientSecret()}),signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw new Error(`Authorization HTTP ${response.status}`);
 const token=(await response.json()).access_token;
 const request=async(url,method='GET',body)=>{const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`${method} ${new URL(url).pathname}: HTTP ${r.status}`);return r.json();};
 const project='nonogram-9d316',out=process.env.EXPORT_DIR;
 if(!out||!path.isAbsolute(out))throw new Error('Private EXPORT_DIR required');
 const authURL=`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
 const rulesBase=`https://firebaserules.googleapis.com/v1/projects/${project}`;
 const auth=await request(authURL),release=await request(`${rulesBase}/releases/cloud.firestore`);
 const backup=path.join(out,'pre-cutover-settings.json');
 if(!fs.existsSync(backup))fs.writeFileSync(backup,JSON.stringify({email:auth.signIn.email,release}),{mode:0o600});
 const rules=await request(`${rulesBase}/rulesets`,'POST',{source:{files:[{name:'firestore.rules',content:"rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }"}]}});
 await request(`${rulesBase}/releases/cloud.firestore`,'PATCH',{release:{name:`projects/${project}/releases/cloud.firestore`,rulesetName:rules.name}});
 await request(`${authURL}?updateMask=signIn.email.enabled`,'PATCH',{signIn:{email:{enabled:false}}});
 const final=await request(authURL),finalRelease=await request(`${rulesBase}/releases/cloud.firestore`);
 if(Boolean(final.signIn?.email?.enabled)||finalRelease.rulesetName!==rules.name)throw new Error('Cutover verification failed');
 console.log('Old Firebase client access disabled; all source users and scores retained; rollback settings saved privately.');
})().catch(e=>{console.error(e.message);process.exitCode=1});
