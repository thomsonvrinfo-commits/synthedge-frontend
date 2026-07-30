import type { Env } from '@synthedge/shared';
import { requireAuth } from './tokens';
import { jsonError, d1All, d1First, d1Run, ulid, nowIso } from '@synthedge/shared';


function json(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}


export async function handleListReplaySessions(
  request: Request,
  env: Env
): Promise<Response> {

  const authResult = await requireAuth(request, env);

  if (authResult instanceof Response) return authResult;


  const sessions = await d1All(
    env.DB,
    `
    SELECT *
    FROM replay_sessions
    WHERE created_by_id = ?
    ORDER BY created_date DESC
    `,
    authResult.sub
  );


  return json(sessions);
}



export async function handleGetReplaySession(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {

  const authResult = await requireAuth(request, env);

  if (authResult instanceof Response) return authResult;


  const session = await d1First(
    env.DB,
    `
    SELECT *
    FROM replay_sessions
    WHERE id = ?
    AND created_by_id = ?
    `,
    id,
    authResult.sub
  );


  if (!session) {
    return jsonError('Replay session not found',404);
  }


  return json(session);
}




export async function handleCreateReplaySession(
  request: Request,
  env: Env
): Promise<Response> {


  const authResult = await requireAuth(request, env);

  if (authResult instanceof Response) return authResult;


  const body = await request.json<Record<string, any>>()
    .catch(() => null);


  if (!body) {
    return jsonError('Invalid body',400);
  }


  const id = ulid();
  const now = nowIso();


  await d1Run(
    env.DB,
    `
    INSERT INTO replay_sessions
    (
      id,
      created_by_id,
      index_name,
      granularity,
      name,
      objective,
      status,
      completed,
      created_date,
      updated_date
    )
    VALUES (?,?,?,?,?,?,?,?,?,?)
    `,
    id,
    authResult.sub,
    body.index_name ?? 'Volatility 50 Index',
    body.granularity ?? 60,
    body.name ?? null,
    body.objective ?? null,
    'active',
    0,
    now,
    now
  );


  return json({
    id,
    ...body,
    status:'active',
    completed:false,
    created_date:now
  },201);

}




export async function handleUpdateReplaySession(
  request: Request,
  env: Env,
  id:string
):Promise<Response>{


const authResult = await requireAuth(request,env);

if(authResult instanceof Response)return authResult;


const body = await request.json<Record<string,any>>()
.catch(()=>null);


if(!body){
return jsonError('Invalid body',400);
}


const allowed = [
'index_name',
'granularity',
'visible_count',
'candle_start_epoch',
'drawings',
'session_trades',
'stats',
'name',
'completed',
'objective',
'status',
'started_at',
'completed_at',
'strategy_name',
'rules_being_tested',
'notes',
'conclusion'
];


const updates:string[]=[];
const values:any[]=[];


for(const key of allowed){

if(key in body){

updates.push(`${key} = ?`);

values.push(
 typeof body[key] === 'object'
 ? JSON.stringify(body[key])
 : body[key]
);

}

}


updates.push('updated_date = ?');
values.push(nowIso());

values.push(id);
values.push(authResult.sub);


await d1Run(
env.DB,
`
UPDATE replay_sessions
SET ${updates.join(',')}
WHERE id = ?
AND created_by_id = ?
`,
...values
);


const updated = await d1First(
env.DB,
`
SELECT *
FROM replay_sessions
WHERE id = ?
`,
id
);


return json(updated);

}




export async function handleDeleteReplaySession(
request:Request,
env:Env,
id:string
):Promise<Response>{


const authResult = await requireAuth(request,env);

if(authResult instanceof Response)return authResult;


await d1Run(
env.DB,
`
DELETE FROM replay_sessions
WHERE id = ?
AND created_by_id = ?
`,
id,
authResult.sub
);


return json({});
}