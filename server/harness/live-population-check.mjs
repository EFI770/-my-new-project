import pg from 'pg';
// Rollback-only RLS contract. Do not pass an owner identity or a vendor token.
// Requires migrations 0001-0009 on the selected database.
if (!process.env.TEST_DATABASE_URL) throw Error('TEST_DATABASE_URL required');
const c=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await c.connect();
try {await c.query('begin');
const ids=(await c.query("insert into auth.users(id) select gen_random_uuid() from generate_series(1,3) returning id")).rows.map(x=>x.id);
for(let i=0;i<3;i++)await c.query("insert into public.profiles(id,display_name,gender,age_attested_at) values($1,'Rollback only population check',$2,now())",[ids[i],i===2?'woman':'man']);
async function ctx(id){await c.query('reset role');await c.query('set local role authenticated');await c.query("select set_config('app.sub',$1,true)",[id]);}
async function deny(name,query,args){await c.query('savepoint deny');try{await c.query(query,args);throw Error('Unexpected success');}catch(e){if(e.code!=='42501')throw e;console.log('PASS '+name);}finally{await c.query('rollback to savepoint deny');}}
await ctx(ids[0]);const visible=(await c.query('select id from public.profiles')).rows.map(x=>x.id);if(!visible.includes(ids[1])||visible.includes(ids[2])||visible.includes('11111111-1111-4111-8111-111111111111'))throw Error('visibility failure');console.log('PASS fresh real-population A sees same gender B but not C/fixtures');
await c.query('insert into public.interest_selections(viewer_id,candidate_id,interested) values($1,$2,true)',[ids[0],ids[1]]);
await ctx(ids[1]);if((await c.query('select * from public.interest_selections')).rows.length)throw Error('private interest leak');await c.query('insert into public.interest_selections(viewer_id,candidate_id,interested) values($1,$2,true)',[ids[1],ids[0]]);if((await c.query('select * from public.list_my_matches()')).rows.length!==1)throw Error('match failure');console.log('PASS private unilateral interest and real-real mutual match');
await ctx(ids[0]);const conn=(await c.query('insert into public.connection_requests(requester_id,recipient_id) values($1,$2) returning id',[ids[0],ids[1]])).rows[0].id;
await deny('contact before accept','select * from public.get_connection_contact($1)',[conn]);await ctx(ids[1]);await c.query("select public.respond_to_connection_request($1,'accepted')",[conn]);await c.query('select public.consent_to_contact($1,true)',[conn]);await deny('contact one-sided consent','select * from public.get_connection_contact($1)',[conn]);await ctx(ids[0]);await c.query('select public.consent_to_contact($1,true)',[conn]);await c.query('select * from public.get_connection_contact($1)',[conn]);console.log('PASS bilateral consent enables contact route');
await c.query('select public.consent_to_contact($1,false)',[conn]);await deny('contact after withdrawal','select * from public.get_connection_contact($1)',[conn]);
await ctx(ids[2]);await deny('third party contact','select * from public.get_connection_contact($1)',[conn]);
await c.query('reset role');await c.query('rollback');console.log('PASS all diagnostic users/ties rolled back');
}catch(e){await c.query('rollback');throw e;}finally{await c.end();}
