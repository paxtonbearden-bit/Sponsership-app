import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Client } from "pg";
import { randomUUID } from "node:crypto";
import { as, createDatabase } from "./db";

let db: Client;

const id = () => randomUUID();
const hostA = { id: id() };
const hostB = { id: id() };
const volA = { id: id() }; // volunteer on org A
const sp1 = { id: id() }; // sponsor S1 (recap NOT approved)
const sp2 = { id: id() }; // sponsor S2 (buys from org B)
const sp3 = { id: id() }; // sponsor S3 (recap approved)
const admin = { id: id() };
const stranger = { id: id() };

const orgA = id(), orgB = id();
const eA = id(), eADraft = id(), eB = id();
const pA = id(), pADraft = id(), pB = id();
const S1 = id(), S2 = id(), S3 = id();
const s1 = id(), s2 = id(), s3 = id();
let dA1: string; // a deliverable on s1
let dA3: string; // a deliverable on s3
let dB2: string; // a deliverable on s2

beforeAll(async () => {
  db = await createDatabase();
  const users = [hostA, hostB, volA, sp1, sp2, sp3, admin, stranger];
  for (const [i, u] of users.entries()) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [u.id, `user${i}@example.com`]);
  }
  await db.query("insert into user_roles values ($1,'admin')", [admin.id]);
  await db.query(
    `insert into organizations (id, name, slug, stripe_account_id) values
      ($1,'Org A','org-a','acct_A'), ($2,'Org B','org-b','acct_B')`, [orgA, orgB]);
  await db.query(
    `insert into org_members values
      ($1,$3,'owner',now()), ($2,$4,'owner',now()), ($1,$5,'volunteer',now())`,
    [orgA, orgB, hostA.id, hostB.id, volA.id]);
  await db.query(
    `insert into events (id, org_id, slug, name, starts_at, status) values
      ($1,$4,'a-pub','A Public', now() - interval '1 day','published'),
      ($2,$4,'a-draft','A Draft', now() + interval '30 days','draft'),
      ($3,$5,'b-pub','B Public', now() - interval '1 day','published')`,
    [eA, eADraft, eB, orgA, orgB]);
  await db.query(
    `insert into packages (id, event_id, name, price_cents) values
      ($1,$4,'Gold',50000), ($2,$5,'Draft pkg',10000), ($3,$6,'Silver',20000)`,
    [pA, pADraft, pB, eA, eADraft, eB]);
  await db.query(
    `insert into package_items (package_id, description, sort_order) values
      ($1,'Logo on banner',1), ($1,'3 Instagram posts',2), ($2,'Draft item',1), ($3,'Booth space',1)`,
    [pA, pADraft, pB]);
  await db.query(
    `insert into sponsors (id, business_name) values ($1,'Sponsor One'), ($2,'Sponsor Two'), ($3,'Sponsor Three')`,
    [S1, S2, S3]);
  await db.query(
    `insert into sponsor_members values ($1,$4,'One','one@x.com'), ($2,$5,'Two','two@x.com'), ($3,$6,'Three','three@x.com')`,
    [S1, S2, S3, sp1.id, sp2.id, sp3.id]);
  await db.query(
    `insert into sponsorships (id, sponsor_id, package_id, amount_cents, platform_fee_cents, status) values
      ($1,$4,$7,50000,3000,'paid'), ($2,$5,$8,20000,1200,'paid'), ($3,$6,$7,50000,3000,'paid')`,
    [s1, s2, s3, S1, S2, S3, pA, pB]);
  dA1 = (await db.query("select id from deliverables where sponsorship_id=$1 order by description limit 1", [s1])).rows[0].id;
  dA3 = (await db.query("select id from deliverables where sponsorship_id=$1 order by description limit 1", [s3])).rows[0].id;
  dB2 = (await db.query("select id from deliverables where sponsorship_id=$1 limit 1", [s2])).rows[0].id;
  await db.query(
    `insert into proofs (deliverable_id, kind, file_path) values ($1,'photo','x/1.jpg'), ($2,'photo','x/3.jpg'), ($3,'photo','x/2.jpg')`,
    [dA1, dA3, dB2]);
  await db.query(
    `insert into recaps (sponsorship_id, host_approved_at) values ($1,null), ($2,now()), ($3,null)`,
    [s1, s3, s2]);
  await db.query(
    `insert into volunteer_upload_tokens (event_id, token_hash, expires_at, created_by)
     values ($1,'hash-a', now() + interval '7 days', $2)`, [eA, hostA.id]);
  await db.query(`insert into audit_log (actor_id, action) values ($1,'impersonate')`, [admin.id]);
});

afterAll(async () => {
  await db?.end();
});

const names = (rows: { name?: string; business_name?: string }[]) =>
  rows.map((r) => r.name ?? r.business_name).sort();

describe("safety net", () => {
  it("has RLS enabled on every table in public", async () => {
    const { rows } = await db.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
    expect(rows).toEqual([]);
  });

  it("anonymous users can read only public tables", async () => {
    const locked = [
      "profiles", "user_roles", "organizations", "org_members", "sponsors", "sponsor_members",
      "sponsorships", "deliverables", "volunteer_upload_tokens", "proofs", "recaps",
      "platform_settings", "audit_log", "ai_import_jobs",
    ];
    for (const t of locked) {
      const r = await as(db, "anon", `select * from ${t}`);
      expect(r.error?.code, `anon select on ${t}`).toBe("42501"); // permission denied
    }
  });

  it("anonymous users cannot write anything", async () => {
    const r = await as(db, "anon", "insert into events (org_id, slug, name, starts_at) values ($1,'hack','Hack',now())", [orgA]);
    expect(r.error?.code).toBe("42501");
  });
});

describe("public pages", () => {
  it("anon sees published events, their packages and items, not drafts", async () => {
    const ev = await as<{ name: string }>(db, "anon", "select name from events");
    expect(names(ev.rows)).toEqual(["A Public", "B Public"]);
    const pk = await as<{ name: string }>(db, "anon", "select name from packages");
    expect(names(pk.rows)).toEqual(["Gold", "Silver"]);
    const it = await as(db, "anon", "select * from package_items");
    expect(it.rowCount).toBe(3); // 2 on Gold + 1 on Silver, none on the draft package
  });

  it("public_organizations hides Stripe ids and orgs with no live event", async () => {
    const r = await as(db, "anon", "select * from public_organizations");
    expect(r.rowCount).toBe(2);
    expect(Object.keys(r.rows[0])).not.toContain("stripe_account_id");
    const direct = await as(db, "anon", "select stripe_account_id from organizations");
    expect(direct.error?.code).toBe("42501");
  });
});

describe("hosts", () => {
  it("host A sees own drafts; host B cannot", async () => {
    const a = await as<{ name: string }>(db, hostA, "select name from events");
    expect(names(a.rows)).toEqual(["A Draft", "A Public", "B Public"]);
    const b = await as<{ name: string }>(db, hostB, "select name from events");
    expect(names(b.rows)).toEqual(["A Public", "B Public"]); // no A Draft
    const bp = await as<{ name: string }>(db, hostB, "select name from packages");
    expect(names(bp.rows)).not.toContain("Draft pkg");
  });

  it("host B cannot read org A's sponsors, sponsorships, deliverables, proofs, tokens, recaps", async () => {
    const q = async (sql: string) => (await as(db, hostB, sql)).rows;
    expect(await q(`select * from sponsorships where event_id='${eA}'`)).toEqual([]);
    expect(await q(`select * from sponsors where id in ('${S1}','${S3}')`)).toEqual([]);
    expect(await q(`select * from sponsor_members where sponsor_id in ('${S1}','${S3}')`)).toEqual([]);
    expect(await q(`select * from deliverables where sponsorship_id in ('${s1}','${s3}')`)).toEqual([]);
    expect(await q(`select * from proofs where deliverable_id in ('${dA1}','${dA3}')`)).toEqual([]);
    expect(await q("select * from volunteer_upload_tokens")).toEqual([]);
    expect(await q(`select * from recaps where sponsorship_id in ('${s1}','${s3}')`)).toEqual([]);
    expect(await q(`select * from organizations where id='${orgA}'`)).toEqual([]);
    expect(await q(`select * from org_members where org_id='${orgA}'`)).toEqual([]);
  });

  it("host A sees their sponsors, sponsorships and contact details", async () => {
    const sps = await as<{ business_name: string }>(db, hostA, "select business_name from sponsors");
    expect(names(sps.rows)).toEqual(["Sponsor One", "Sponsor Three"]);
    const ss = await as(db, hostA, "select * from sponsorships");
    expect(ss.rowCount).toBe(2);
    const sm = await as(db, hostA, "select contact_email from sponsor_members");
    expect(sm.rowCount).toBe(2);
  });

  it("host B cannot modify org A's data", async () => {
    const upd = await as(db, hostB, "update events set name='pwned' where id=$1", [eA]);
    expect(upd.rowCount).toBe(0);
    const updOrg = await as(db, hostB, "update organizations set name='pwned' where id=$1", [orgA]);
    expect(updOrg.rowCount).toBe(0);
    const ins = await as(db, hostB, "insert into packages (event_id, name, price_cents) values ($1,'x',1)", [eA]);
    expect(ins.error?.code).toBe("42501");
    const mark = await as(db, hostB, "update deliverables set status='delivered' where id=$1", [dA1]);
    expect(mark.rowCount).toBe(0);
    const addSelf = await as(db, hostB, "insert into org_members values ($1,$2,'owner')", [orgA, hostB.id]);
    expect(addSelf.error?.code).toBe("42501");
  });

  it("host cannot move an event into another org", async () => {
    const r = await as(db, hostA, "update events set org_id=$1 where id=$2", [orgB, eA]);
    expect(r.error?.code).toBe("42501");
  });

  it("host can manage own packages and confirm deliverables", async () => {
    const ins = await as(db, hostA, "insert into packages (event_id, name, price_cents) values ($1,'Bronze',5000)", [eA]);
    expect(ins.error).toBeUndefined();
    const mark = await as(db, hostA, "update deliverables set status='delivered' where id=$1", [dA1]);
    expect(mark.rowCount).toBe(1);
  });

  it("nobody can edit the promise text, payments, or Stripe fields from the browser", async () => {
    const t = await as(db, hostA, "update deliverables set description='changed' where id=$1", [dA1]);
    expect(t.error?.code).toBe("42501");
    const p = await as(db, hostA, "update sponsorships set amount_cents=1 where id=$1", [s1]);
    expect(p.error?.code).toBe("42501");
    const st = await as(db, hostA, "update organizations set stripe_account_id='acct_evil' where id=$1", [orgA]);
    expect(st.error?.code).toBe("42501");
    const role = await as(db, hostA, "insert into user_roles values ($1,'admin')", [hostA.id]);
    expect(role.error?.code).toBe("42501");
  });
});

describe("volunteers", () => {
  it("can see the event and upload proof, but not mark delivered or change packages", async () => {
    const ev = await as(db, volA, "select * from events where id=$1", [eADraft]);
    expect(ev.rowCount).toBe(1);
    const proof = await as(db, volA,
      "insert into proofs (deliverable_id, kind, file_path, uploaded_by) values ($1,'photo','x/v.jpg',$2)", [dA1, volA.id]);
    expect(proof.error).toBeUndefined();
    const spoof = await as(db, volA,
      "insert into proofs (deliverable_id, kind, file_path, uploaded_by) values ($1,'photo','x/v.jpg',$2)", [dA1, hostA.id]);
    expect(spoof.error?.code).toBe("42501");
    const mark = await as(db, volA, "update deliverables set status='delivered' where id=$1", [dA1]);
    expect(mark.rowCount).toBe(0);
    const pkg = await as(db, volA, "insert into packages (event_id, name, price_cents) values ($1,'x',1)", [eA]);
    expect(pkg.error?.code).toBe("42501");
    const wrongOrg = await as(db, volA,
      "insert into proofs (deliverable_id, kind, file_path, uploaded_by) values ($1,'photo','x/v.jpg',$2)", [dB2, volA.id]);
    expect(wrongOrg.error?.code).toBe("42501");
    const tokens = await as(db, volA, "select * from volunteer_upload_tokens");
    expect(tokens.rowCount).toBe(0);
  });
});

describe("sponsors", () => {
  it("each sponsor sees only their own sponsorships and deliverables", async () => {
    const mine = await as(db, sp1, "select id from sponsorships");
    expect(mine.rows).toEqual([{ id: s1 }]);
    const d = await as<{ sponsorship_id: string }>(db, sp1, "select sponsorship_id from deliverables");
    expect(d.rowCount).toBe(2);
    expect(new Set(d.rows.map((r) => r.sponsorship_id))).toEqual(new Set([s1]));
    const others = await as(db, sp1, "select * from sponsors where id <> $1", [S1]);
    expect(others.rowCount).toBe(0);
  });

  it("sponsors cannot see proof until the host approves the recap", async () => {
    const before = await as(db, sp1, "select * from proofs");
    expect(before.rowCount).toBe(0);
    const approved = await as(db, sp3, "select * from proofs");
    expect(approved.rowCount).toBe(1);
    const recap1 = await as(db, sp1, "select * from recaps");
    expect(recap1.rowCount).toBe(0);
    const recap3 = await as(db, sp3, "select * from recaps");
    expect(recap3.rowCount).toBe(1);
  });

  it("sponsors cannot touch deliverables, packages, org data or other sponsors' recaps", async () => {
    const mark = await as(db, sp1, "update deliverables set status='delivered' where id=$1", [dA1]);
    expect(mark.rowCount).toBe(0);
    const pk = await as(db, sp1, "update packages set price_cents=1 where id=$1", [pA]);
    expect(pk.rowCount).toBe(0);
    const org = await as(db, sp1, "select * from organizations");
    expect(org.rowCount).toBe(0);
    const members = await as(db, sp1, "select * from org_members");
    expect(members.rowCount).toBe(0);
    const tokens = await as(db, sp1, "select * from volunteer_upload_tokens");
    expect(tokens.rowCount).toBe(0);
    const approve = await as(db, sp1, "update recaps set host_approved_at=now()");
    expect(approve.rowCount).toBe(0);
    const buy = await as(db, sp1, "insert into sponsorships (sponsor_id, package_id, amount_cents, status) values ($1,$2,0,'paid')", [S1, pA]);
    expect(buy.error?.code).toBe("42501");
  });

  it("a sponsor can edit their own business profile but not someone else's", async () => {
    const own = await as(db, sp1, "update sponsors set city='Lakeland' where id=$1", [S1]);
    expect(own.rowCount).toBe(1);
    const other = await as(db, sp1, "update sponsors set city='x' where id=$1", [S2]);
    expect(other.rowCount).toBe(0);
  });
});

describe("profiles and other users", () => {
  it("users see only their own profile; strangers see nothing of value", async () => {
    const own = await as(db, hostA, "select id from profiles");
    expect(own.rows).toEqual([{ id: hostA.id }]);
    const stranger_ = await as(db, stranger, "select * from events where status='draft'");
    expect(stranger_.rowCount).toBe(0);
    const spons = await as(db, stranger, "select * from sponsorships");
    expect(spons.rowCount).toBe(0);
  });

  it("users cannot change their email on their profile", async () => {
    const r = await as(db, hostA, "update profiles set email='x@y.z' where id=$1", [hostA.id]);
    expect(r.error?.code).toBe("42501");
  });
});

describe("admin", () => {
  it("can read across organizations, and only admins can read settings and audit log", async () => {
    const ss = await as(db, admin, "select * from sponsorships");
    expect(ss.rowCount).toBe(3);
    const ev = await as(db, admin, "select * from events");
    expect(ev.rowCount).toBe(3);
    const fee = await as<{ value: unknown }>(db, admin, "select value from platform_settings where key='platform_fee_bps'");
    expect(fee.rows[0].value).toBe(600);
    expect((await as(db, admin, "select * from audit_log")).rowCount).toBe(1);
    expect((await as(db, hostA, "select * from platform_settings")).rowCount).toBe(0);
    expect((await as(db, hostA, "select * from audit_log")).rowCount).toBe(0);
  });
});

describe("create_organization", () => {
  it("makes the caller an owner and a host; rejects anonymous callers", async () => {
    const r = await as<{ id: string }>(db, stranger,
      "select create_organization('New Club','new-club','festival','Tampa','Hillsborough') as id");
    expect(r.error).toBeUndefined();
    const anon = await as(db, "anon", "select create_organization('x','x')");
    expect(anon.error).toBeDefined();
  });

  it("the new org's events and members stay private to the creator", async () => {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [stranger.id]);
    const org = (await db.query("select create_organization('Club 2','club-2') as id")).rows[0].id;
    const roles = await db.query("select role from user_roles");
    const members = await db.query("select role from org_members where org_id=$1", [org]);
    await db.query("rollback");
    expect(roles.rows).toEqual([{ role: "host" }]);
    expect(members.rows).toEqual([{ role: "owner" }]);
  });
});

describe("deliverables snapshot", () => {
  it("are created when a sponsorship is paid and copy the package items", async () => {
    const { rows } = await db.query("select description from deliverables where sponsorship_id=$1 order by description", [s1]);
    expect(rows.map((r) => r.description)).toEqual(["3 Instagram posts", "Logo on banner"]);
  });

  it("do not change when the package is edited later", async () => {
    await db.query("update package_items set description='CHANGED' where package_id=$1", [pA]);
    const { rows } = await db.query("select description from deliverables where sponsorship_id=$1", [s1]);
    expect(rows.map((r) => r.description)).not.toContain("CHANGED");
    await db.query("update package_items set description='Logo on banner' where package_id=$1 and sort_order=1", [pA]);
  });

  it("are not duplicated when a paid sponsorship is updated again", async () => {
    await db.query("update sponsorships set status='refunded' where id=$1", [s1]);
    await db.query("update sponsorships set status='paid' where id=$1", [s1]);
    const { rows } = await db.query("select count(*)::int as n from deliverables where sponsorship_id=$1", [s1]);
    expect(rows[0].n).toBe(2);
  });

  it("pending sponsorships get no deliverables, and event_id always follows the package", async () => {
    const pending = id();
    await db.query(
      "insert into sponsorships (id, sponsor_id, package_id, event_id, amount_cents) values ($1,$2,$3,$4,1)",
      [pending, S2, pA, eB]); // caller lies about event_id
    const { rows } = await db.query("select event_id, (select count(*)::int from deliverables where sponsorship_id=$1) as n from sponsorships where id=$1", [pending]);
    expect(rows[0]).toEqual({ event_id: eA, n: 0 });
    await db.query("delete from sponsorships where id=$1", [pending]);
  });
});

describe("fulfillment score", () => {
  it("is hidden until a host has at least 10 promised items, then is delivered / promised", async () => {
    const before = await as<{ score_percent: string | null }>(db, "anon", "select score_percent from public_host_scores where org_id=$1", [orgB]);
    expect(before.rows[0].score_percent).toBeNull();

    const pBig = id();
    await db.query("insert into packages (id, event_id, name, price_cents) values ($1,$2,'Big',1)", [pBig, eB]);
    for (let i = 0; i < 9; i++) {
      await db.query("insert into package_items (package_id, description) values ($1,$2)", [pBig, `item ${i}`]);
    }
    const big = id();
    await db.query("insert into sponsorships (id, sponsor_id, package_id, amount_cents, status) values ($1,$2,$3,1,'paid')", [big, S2, pBig]);
    // orgB now has 1 (Booth) + 9 = 10 promised; mark 5 delivered
    await db.query(
      "update deliverables set status='delivered' where id in (select id from deliverables where sponsorship_id=$1 limit 5)", [big]);
    const after = await as<{ score_percent: string; promised: string; delivered: string }>(db, "anon",
      "select score_percent, promised, delivered from public_host_scores where org_id=$1", [orgB]);
    expect(Number(after.rows[0].promised)).toBe(10);
    expect(Number(after.rows[0].delivered)).toBe(5);
    expect(Number(after.rows[0].score_percent)).toBe(50);
  });
});

describe("storage policies", () => {
  it("only event members can write to the proofs bucket for their event", async () => {
    const ok = await as(db, hostA, "insert into storage.objects (bucket_id, name) values ('proofs', $1)", [`${eA}/${dA1}/a.jpg`]);
    expect(ok.error).toBeUndefined();
    const vol = await as(db, volA, "insert into storage.objects (bucket_id, name) values ('proofs', $1)", [`${eA}/${dA1}/b.jpg`]);
    expect(vol.error).toBeUndefined();
    const bad = await as(db, hostB, "insert into storage.objects (bucket_id, name) values ('proofs', $1)", [`${eA}/${dA1}/c.jpg`]);
    expect(bad.error?.code).toBe("42501");
    const sponsor = await as(db, sp1, "insert into storage.objects (bucket_id, name) values ('proofs', $1)", [`${eA}/${dA1}/d.jpg`]);
    expect(sponsor.error?.code).toBe("42501");
    const garbage = await as(db, hostA, "insert into storage.objects (bucket_id, name) values ('proofs', 'not-a-uuid/x.jpg')");
    expect(garbage.error?.code).toBe("42501");
  });

  it("only org managers can write org logos", async () => {
    const ok = await as(db, hostA, "insert into storage.objects (bucket_id, name) values ('logos', $1)", [`orgs/${orgA}/logo.png`]);
    expect(ok.error).toBeUndefined();
    const vol = await as(db, volA, "insert into storage.objects (bucket_id, name) values ('logos', $1)", [`orgs/${orgA}/logo.png`]);
    expect(vol.error?.code).toBe("42501");
    const other = await as(db, hostB, "insert into storage.objects (bucket_id, name) values ('logos', $1)", [`orgs/${orgA}/logo.png`]);
    expect(other.error?.code).toBe("42501");
    const sp = await as(db, sp1, "insert into storage.objects (bucket_id, name) values ('logos', $1)", [`sponsors/${S1}/logo.png`]);
    expect(sp.error).toBeUndefined();
    const spOther = await as(db, sp1, "insert into storage.objects (bucket_id, name) values ('logos', $1)", [`sponsors/${S2}/logo.png`]);
    expect(spOther.error?.code).toBe("42501");
  });
});
