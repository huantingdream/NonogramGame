import base64, json, time, urllib.request, urllib.error
project='demo-gejian-score-tests'
root=f'http://127.0.0.1:8180/v1/projects/{project}/databases/(default)/documents'
resource=f'projects/{project}/databases/(default)/documents'
def token(uid):
    enc=lambda v:base64.urlsafe_b64encode(json.dumps(v).encode()).decode().rstrip('=')
    now=int(time.time())
    return enc({'alg':'none','typ':'JWT'})+'.'+enc({'sub':uid,'user_id':uid,'name':'Tester','aud':project,'iss':f'https://securetoken.google.com/{project}','iat':now,'exp':now+3600,'auth_time':now,'firebase':{'sign_in_provider':'password'}})+'.'
def request(path,body=None,user='tester'):
    headers={'Content-Type':'application/json'}
    if user:headers['Authorization']='Bearer '+token(user)
    req=urllib.request.Request(root+path,headers=headers,data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req) as response:return response.status,response.read().decode()
    except urllib.error.HTTPError as e:return e.code,e.read().decode()
def field(v):
    if isinstance(v,str):return {'stringValue':v}
    if isinstance(v,int):return {'integerValue':str(v)}
    return {'doubleValue':v}
seq=100
passed=0
def write(data,user='tester',expected=200,docid=None,stamp=True):
    global seq,passed
    seq+=1
    data={**data,'puzzleSeed':seq} if docid is None else data
    docid=docid or f"tester_{data.get('game','aim')}_{data.get('size',330)}_{data.get('difficulty','normal')}_{seq}"
    update={'name':resource+'/scores/'+docid,'fields':{k:field(v) for k,v in data.items()}}
    w={'update':update}
    if stamp:w['updateTransforms']=[{'fieldPath':'createdAt','setToServerValue':'REQUEST_TIME'}]
    code,text=request(':commit',{'writes':[w]},user)
    assert code==expected,(expected,code,data,text)
    passed+=1
    return docid,data
base={'uid':'tester','nickname':'Tester','game':'aim','size':330,'difficulty':'normal','elapsedSeconds':30,'puzzleId':1,'puzzleSeed':1,'hits':3,'shots':4,'averageMs':200}
doc,valid=write(base)
write(valid,docid=doc,expected=403) # replay / update
for game,size,diff in [('nonogram',5,'easy'),('sudoku',9,'normal'),('minesweeper',81,'easy'),('2048',16,'normal'),('slitherlink',105,'easy'),('hashi',207,'easy'),('reaction',305,'normal')]:
    data={k:v for k,v in base.items() if k not in ('hits','shots','averageMs')};data.update(game=game,size=size,difficulty=diff)
    if game=='reaction':data['averageMs']=237
    write(data)
write({**base,'hits':0,'shots':0,'averageMs':0})
for patch in [{'hits':5},{'hits':-1},{'hits':1.5},{'shots':10001},{'averageMs':0},{'averageMs':30001},{'averageMs':'200'},{'elapsedSeconds':29},{'size':305},{'difficulty':'admin'},{'uid':'other'},{'nickname':'Other'},{'nickname':'x'*21},{'isAdmin':1},{'createdAt':'old-date'}]:
    write({**base,**patch},expected=403,stamp='createdAt' not in patch)
for key in ['hits','shots','averageMs','uid','game']:
    data=dict(base);del data[key];write(data,expected=403)
write(base,user=None,expected=403)
write(base,user='other',expected=403)
write(base,stamp=False,expected=403)
write({**base,'game':'reaction','size':305},expected=403) # aim fields forbidden on reaction
legacy={k:v for k,v in base.items() if k not in ('hits','shots')};legacy.update(game='sudoku',size=9)
write(legacy,expected=403) # metrics forbidden on old puzzle schemas
for user,expected in [(None,403),('other',200)]:
    code,text=request('/scores/'+doc,user=user);assert code==expected,(code,text);passed+=1
for user,limit,expected in [(None,20,403),('tester',20,200),('tester',21,403)]:
    code,text=request(':runQuery',{'structuredQuery':{'from':[{'collectionId':'scores'}],'limit':limit}},user)
    assert code==expected,(code,text);passed+=1
code,text=request(':commit',{'writes':[{'delete':resource+'/scores/'+doc}]});assert code==403,(code,text);passed+=1
print(f'PASS: {passed} Firestore emulator checks, including all 8 games, metrics, authentication, replay, schema, ownership and query limits.')
