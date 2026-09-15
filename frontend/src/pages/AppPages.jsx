import { createContext, useContext, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, clearSession, jsonBody } from "../lib/api";

const AuthContext = createContext(null);
const rolePath = {
  ADMIN: "/admin",
  BEEKEEPER: "/dashboard",
  LAB_INSPECTOR: "/lab",
  PROCESSOR: "/dashboard",
  DISTRIBUTOR: "/dashboard",
  RETAILER: "/retailer",
  CONSUMER: "/consumer"
};

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("honey-chain-user")); } catch { return null; }
  });

  function setSession(result) {
    localStorage.setItem("honey-chain-token", result.token);
    localStorage.setItem("honey-chain-user", JSON.stringify(result.user));
    setUser(result.user);
  }
  function logout() { clearSession(); setUser(null); }

  return <AuthContext.Provider value={{ user, setSession, logout }}>{children}</AuthContext.Provider>;
}

function useAuth() { return useContext(AuthContext); }

function Protected({ children, roles }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={rolePath[user.role] || "/dashboard"} replace />;
  return children;
}

function Shell({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = [
    ["Dashboard", rolePath[user.role] || "/dashboard"],
    ["My batches", "/batches"],
    ...(user.role === "LAB_INSPECTOR" ? [["Pending lab", "/lab"]] : []),
    ...(["PROCESSOR", "DISTRIBUTOR", "RETAILER"].includes(user.role) ? [["Eligible batches", "/eligible"]] : []),
    ...(["BEEKEEPER", "PROCESSOR", "DISTRIBUTOR"].includes(user.role) ? [["Requests", "/requests"]] : []),
    ...(user.role === "RETAILER" ? [["QR codes", "/retailer"]] : []),
    ...(user.role === "ADMIN" ? [["Role management", "/admin"]] : []),
    ...(user.role === "CONSUMER" ? [["For sale", "/consumer"]] : [])
  ];
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-ink/10 bg-ink px-5 py-4 text-cream">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link to={rolePath[user.role] || "/dashboard"} className="font-display text-2xl tracking-tight">BEEKEEPER</Link>
          <div className="flex items-center gap-4 text-right text-xs">
            <div><div className="font-semibold">{user.username}</div><div className="text-cream/60">{user.role}</div></div>
            <button className="rounded-full border border-cream/30 px-3 py-1.5 hover:bg-cream/10" onClick={() => { logout(); navigate("/login"); }}>Log out</button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl gap-6 px-5 py-6">
        <aside className="hidden w-52 shrink-0 md:block">
          <nav className="space-y-1 rounded-2xl bg-white p-3 shadow-soft">
            {links.map(([label, href]) => <Link key={href + label} className="block rounded-xl px-3 py-2 text-sm font-semibold hover:bg-honey/15" to={href}>{label}</Link>)}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function Notice({ error, success }) {
  if (!error && !success) return null;
  return <div className={`mb-5 rounded-xl border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-green-200 bg-green-50 text-green-800"}`}>{error || success}</div>;
}

function AuthPage({ register = false }) {
  const { user, setSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "BEEKEEPER", adminCode: "" });
  const [error, setError] = useState("");
  if (user) return <Navigate to={rolePath[user.role] || "/dashboard"} replace />;
  async function submit(event) {
    event.preventDefault(); setError("");
    try {
      const result = await api(`/auth/${register ? "register" : "login"}`, { method: "POST", body: jsonBody(form) });
      setSession(result); navigate(rolePath[result.user.role] || "/dashboard");
    } catch (err) { setError(err.message); }
  }
  return <div className="grid min-h-screen place-items-center bg-ink px-5 py-10">
    <form onSubmit={submit} className="w-full max-w-md rounded-3xl bg-cream p-8 shadow-soft">
      <div className="mb-8"><p className="eyebrow">BEEKEEPER</p><h1 className="mt-2 font-display text-4xl">{register ? "Create account" : "Welcome back"}</h1><p className="mt-2 text-sm text-ink/60">Trace every jar from apiary to shelf.</p></div>
      <Notice error={error} />
      <label>Username<input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></label>
      {register && <label>Email<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>}
      {register && <label>Role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{["BEEKEEPER", "LAB_INSPECTOR", "PROCESSOR", "DISTRIBUTOR", "RETAILER", "CONSUMER", "ADMIN"].map(role => <option key={role}>{role}</option>)}</select></label>}
      {register && form.role === "ADMIN" && <label>Admin code<input required type="password" placeholder="Required for admin registration" value={form.adminCode} onChange={e => setForm({ ...form, adminCode: e.target.value })} /></label>}
      <label>Password<input required type="password" minLength="8" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
      <button className="mt-3 w-full rounded-xl bg-ink px-4 py-3 font-bold text-cream hover:bg-moss">{register ? "Create account" : "Log in"}</button>
      <p className="mt-6 text-center text-sm text-ink/60">{register ? <>Already registered? <Link className="font-bold text-moss" to="/login">Log in</Link></> : <>New to BEEKEEPER? <Link className="font-bold text-moss" to="/register">Register</Link></>}</p>
    </form>
  </div>;
}

function PageHeading({ eyebrow, title, children }) { return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-1 font-display text-4xl">{title}</h1></div>{children}</div>; }

function BatchTable({ batches = [] }) {
  return <div className="overflow-hidden rounded-2xl bg-white shadow-soft"><table className="w-full text-left text-sm"><thead className="bg-ink text-xs uppercase tracking-widest text-cream/70"><tr><th className="px-4 py-3">Batch</th><th className="px-4 py-3">Honey</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead><tbody>{batches.map(batch => <tr className="border-b border-ink/5 last:border-0" key={batch.blockchainBatchId || batch.batchId}><td className="px-4 py-4 font-bold">#{batch.blockchainBatchId || batch.batchId}</td><td className="px-4 py-4">{batch.honeyType}<div className="text-xs text-ink/50">{batch.apiaryId}</div></td><td className="px-4 py-4"><span className="status-pill">{batch.status || batch.statusName}</span></td><td className="px-4 py-4 text-right"><Link className="font-bold text-moss" to={`/batches/${batch.blockchainBatchId || batch.batchId}`}>View</Link></td></tr>)}</tbody></table>{batches.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink/50">No batches found.</p>}</div>;
}

function Dashboard() {
  const { user } = useAuth(); const [data, setData] = useState({ total: 0, counts: {} }); const [batches, setBatches] = useState([]); const [incoming, setIncoming] = useState([]); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const load = () => Promise.all([api("/dashboard/summary"), api("/dashboard/my-batches"), user.role === "BEEKEEPER" ? api("/custody/requests/incoming") : Promise.resolve({ requests: [] })]).then(([summary, mine, requests]) => { setData(summary); setBatches(mine.batches); setIncoming(requests.requests); }).catch(err => setError(err.message));
  useEffect(() => { load(); }, []);
  async function decision(id, action) { setError(""); setSuccess(""); try { const result = await api(`/custody/requests/${id}/${action}`, { method: "POST", body: jsonBody({}) }); setSuccess(action === "approve" ? `Batch transferred to processor: ${result.transactionHash}` : "Custody request rejected"); load(); } catch (err) { setError(err.message); } }
  const processor = user.role === "PROCESSOR";
  return <Shell><PageHeading eyebrow={user.role} title={`Good day, ${user.username}`}><Link className="button-primary" to={user.role === "BEEKEEPER" ? "/batches/create" : processor ? "/batches" : "/eligible"}>{user.role === "BEEKEEPER" ? "Register a batch" : processor ? "View movement batches" : "Find eligible batches"}</Link></PageHeading><Notice error={error} success={success} />{processor ? <div className="mb-7 grid gap-4 sm:grid-cols-2"><Metric label="My movement batches" value={data.total} /><Metric label="Ready for sale" value={data.counts.READY_FOR_SALE || 0} /></div> : <div className="mb-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Total batches" value={data.total} /><Metric label="Waiting lab" value={data.counts.AWAITING_LAB_TEST || 0} /><Metric label="Lab passed" value={data.counts.LAB_PASSED || 0} /><Metric label="In movement" value={(data.counts.PROCESSING || 0) + (data.counts.IN_TRANSIT || 0)} /><Metric label="Ready for sale" value={data.counts.READY_FOR_SALE || 0} /></div>}<section><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-2xl">{processor ? "Movement batches" : "Your chain view"}</h2><Link className="text-sm font-bold text-moss" to="/batches">View all</Link></div><BatchTable batches={batches} /></section>{user.role === "BEEKEEPER" && <section className="mt-8"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-2xl">Custody requests</h2><Link className="text-sm font-bold text-moss" to="/requests">View all</Link></div><RequestList title="Pending requests" requests={incoming} actions={(request) => <><button className="button-small" onClick={() => decision(request._id, "approve")}>Approve transfer</button><button className="button-small danger" onClick={() => decision(request._id, "reject")}>Reject</button></>} /></section>}</Shell>;
}

function Metric({ label, value }) { return <div className="rounded-2xl bg-white p-5 shadow-soft"><p className="text-xs font-bold uppercase tracking-widest text-ink/45">{label}</p><p className="mt-4 font-display text-4xl">{value}</p></div>; }

function CreateBatch() {
  const [form, setForm] = useState({ honeyType: "", quantity: "" }); const [nextBatchId, setNextBatchId] = useState(null); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  async function loadNextBatchId() { try { const result = await api("/batches/next-id"); setNextBatchId(result.nextBatchId); } catch (err) { setError(err.message); } }
  useEffect(() => { loadNextBatchId(); }, []);
  async function submit(e) { e.preventDefault(); setError(""); setSuccess(""); try { const result = await api("/batches", { method: "POST", body: jsonBody(form) }); setSuccess(`Batch #${result.batchId} confirmed in transaction ${result.transactionHash}`); setForm({ honeyType: "", quantity: "" }); setNextBatchId(String(BigInt(result.batchId) + 1n)); } catch (err) { setError(err.message); await loadNextBatchId(); } }
  return <Shell><PageHeading eyebrow="BEEKEEPER" title="Register honey batch" /><Notice error={error} success={success} /><form onSubmit={submit} className="max-w-2xl rounded-2xl bg-white p-6 shadow-soft"><div className="mb-5 rounded-xl bg-honey/15 px-4 py-3"><p className="text-xs font-bold uppercase tracking-widest text-ink/50">Batch number</p><p className="mt-1 font-display text-3xl">{nextBatchId ? `#${nextBatchId}` : "Loading..."}</p></div><label>Honey type<input required placeholder="Mustard Honey" value={form.honeyType} onChange={e => setForm({ ...form, honeyType: e.target.value })} /></label><label>Quantity<input required min="1" type="number" placeholder="25" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></label><button disabled={!nextBatchId} className="button-primary disabled:cursor-not-allowed disabled:opacity-50">Create batch #{nextBatchId || "..."}</button></form></Shell>;
}

function BatchesPage({ eligible = false }) {
  const [batches, setBatches] = useState([]); const [selected, setSelected] = useState(null); const [location, setLocation] = useState(""); const [notes, setNotes] = useState(""); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const { user } = useAuth();
  useEffect(() => { api(eligible ? "/dashboard/eligible-batches" : "/dashboard/my-batches").then(result => setBatches(result.batches)).catch(err => setError(err.message)); }, [eligible]);
  async function requestCustody(e) { e.preventDefault(); setError(""); setSuccess(""); try { await api("/custody/request", { method: "POST", body: jsonBody({ batchId: selected.blockchainBatchId || selected.batchId, location, notes }) }); setSuccess("Custody request submitted to the beekeeper."); setSelected(null); setLocation(""); setNotes(""); } catch (err) { setError(err.message); } }
  return <Shell><PageHeading eyebrow={eligible ? "NEXT HANDOFF" : user.role} title={eligible ? "Eligible batches" : "My batches"} /> <Notice error={error} success={success} />{eligible ? <div className="grid gap-4 md:grid-cols-2">{batches.map(batch => <div className="card-hover" key={batch.blockchainBatchId || batch.batchId}><b>Batch #{batch.blockchainBatchId || batch.batchId}</b><p className="mt-1 text-sm text-ink/55">{batch.honeyType} · {batch.apiaryId}</p><button className="button-small mt-4" onClick={() => setSelected(batch)}>Request custody</button></div>)}{!batches.length && <div className="rounded-2xl bg-white p-8 text-sm text-ink/50">No eligible batches found.</div>}</div> : <BatchTable batches={batches} />}{selected && <form onSubmit={requestCustody} className="mt-6 max-w-xl rounded-2xl bg-white p-6 shadow-soft"><p className="eyebrow">BATCH #{selected.blockchainBatchId || selected.batchId}</p><h2 className="mt-2 font-display text-2xl">Request custody</h2><label>Handoff location<input required value={location} onChange={e => setLocation(e.target.value)} placeholder="Processing facility" /></label><label>Notes <span className="text-ink/40">optional</span><input value={notes} onChange={e => setNotes(e.target.value)} /></label><button className="button-primary mt-4">Submit request</button></form>}</Shell>;
}

function LabPage() {
  const [batches, setBatches] = useState([]); const [selected, setSelected] = useState(null); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const load = () => api("/lab/batches/pending").then(result => setBatches(result.batches)).catch(err => setError(err.message)); useEffect(() => { load(); }, []);
  async function submit(e) { e.preventDefault(); setError(""); setSuccess(""); const batchId = selected.batchId || selected.blockchainBatchId; const body = new FormData(); body.append("batchId", batchId); try { const result = await api("/lab/test/upload", { method: "POST", body }); setSuccess(`Lab result confirmed: ${result.transactionHash}`); setSelected(null); load(); } catch (err) { setError(err.message); } }
  return <Shell><PageHeading eyebrow="LAB INSPECTOR" title="Pending laboratory tests" /><Notice error={error} success={success} /><div className="grid gap-5 lg:grid-cols-[1fr_380px]"><div className="space-y-3">{batches.map(batch => <button key={batch.batchId || batch.blockchainBatchId} onClick={() => setSelected(batch)} className="card-hover flex w-full items-center justify-between text-left"><span><b>Batch #{batch.batchId || batch.blockchainBatchId}</b><span className="ml-3 text-sm text-ink/55">{batch.honeyType} · {batch.apiaryId}</span></span><span className="text-sm font-bold text-moss">Test batch</span></button>)}{!batches.length && <div className="rounded-2xl bg-white p-8 text-center text-sm text-ink/50">No batches are waiting for testing.</div>}</div>{selected && <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-soft"><p className="eyebrow">BATCH #{selected.batchId || selected.blockchainBatchId}</p><h2 className="mt-2 font-display text-2xl">Record result</h2><p className="mt-3 rounded-xl bg-moss/10 px-4 py-3 text-sm text-ink/65">This action records the batch as passed.</p><button className="button-primary">Upload and record</button></form>}</div></Shell>;
}

function RequestsPage() {
  const [incoming, setIncoming] = useState([]); const [outgoing, setOutgoing] = useState([]); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const { user } = useAuth();
  const load = () => Promise.all([
    ["BEEKEEPER", "PROCESSOR", "DISTRIBUTOR"].includes(user.role) ? api("/custody/requests/incoming") : Promise.resolve({ requests: [] }),
    ["PROCESSOR", "DISTRIBUTOR", "RETAILER"].includes(user.role) ? api("/custody/requests/outgoing") : Promise.resolve({ requests: [] })
  ]).then(([a, b]) => { setIncoming(a.requests); setOutgoing(b.requests); }).catch(err => setError(err.message)); useEffect(() => { load(); }, []);
  async function decision(id, action) { try { const result = await api(`/custody/requests/${id}/${action}`, { method: "POST", body: jsonBody({}) }); setSuccess(action === "approve" ? `Transfer confirmed: ${result.transactionHash}` : "Request rejected"); load(); } catch (err) { setError(err.message); } }
  return <Shell><PageHeading eyebrow="CUSTODY" title="Requests" /><Notice error={error} success={success} /><div className="grid gap-6 lg:grid-cols-2"><RequestList title="Needs your approval" requests={incoming} actions={(request) => <><button className="button-small" onClick={() => decision(request._id, "approve")}>Approve</button><button className="button-small danger" onClick={() => decision(request._id, "reject")}>Reject</button></>} /><RequestList title="Your requests" requests={outgoing} /></div>{user.role === "BEEKEEPER" && <p className="mt-5 text-sm text-ink/50">Downstream partners can request batches after a laboratory pass.</p>}</Shell>;
}

function RequestList({ title, requests, actions }) { return <section><h2 className="mb-3 font-display text-2xl">{title}</h2><div className="space-y-3">{requests.map(request => <div className="rounded-2xl bg-white p-5 shadow-soft" key={request._id}><div className="flex justify-between gap-3"><b>Batch #{request.blockchainBatchId}</b><span className="status-pill">{request.status}</span></div><p className="mt-2 text-sm text-ink/60">{request.fromRole} → {request.toRole}<br />{request.location}</p>{actions && <div className="mt-4 flex gap-2">{actions(request)}</div>}</div>)}{!requests.length && <div className="rounded-2xl bg-white p-6 text-sm text-ink/50">Nothing here yet.</div>}</div></section>; }

function QRPage() { const [batches, setBatches] = useState([]); const [qr, setQr] = useState(null); const [error, setError] = useState(""); useEffect(() => { api("/dashboard/my-batches").then(r => setBatches(r.batches)).catch(e => setError(e.message)); }, []); async function generate(id) { try { setQr(await api(`/batches/${id}/qr`, { method: "POST", body: jsonBody({}) })); } catch (e) { setError(e.message); } } return <Shell><PageHeading eyebrow="RETAILER" title="Package verification" /><Notice error={error} /> <div className="grid gap-5 md:grid-cols-2">{batches.filter(b => (b.status || b.statusName) === "READY_FOR_SALE").map(b => <div className="card-hover" key={b.blockchainBatchId}><b>Batch #{b.blockchainBatchId}</b><p className="mt-1 text-sm text-ink/55">{b.honeyType} · {b.apiaryId}</p><button className="button-small mt-4" onClick={() => generate(b.blockchainBatchId)}>Generate QR</button></div>)}</div>{qr && <div className="mt-7 max-w-sm rounded-2xl bg-white p-6 text-center shadow-soft"><img className="mx-auto" src={qr.qrCodeDataUrl} alt="Public batch verification QR code" /><p className="mt-4 break-all text-xs text-ink/60">{qr.verificationUrl}</p><a className="button-primary mt-4 inline-block" download={`batch-${qr.batchId}.png`} href={qr.qrCodeDataUrl}>Download QR</a></div>}</Shell>; }

function ConsumerPage() { const [batches, setBatches] = useState([]); const [error, setError] = useState(""); useEffect(() => { api("/batches/ready-for-sale").then(result => setBatches(result.batches)).catch(err => setError(err.message)); }, []); return <Shell><PageHeading eyebrow="CONSUMER" title="Honey ready for sale" /><Notice error={error} /><div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">{batches.map(({ batch, qrCodeDataUrl }) => <article className="rounded-2xl bg-white p-5 shadow-soft" key={batch.batchId}><img className="mx-auto w-52 rounded-xl border border-ink/10 p-2" src={qrCodeDataUrl} alt={`QR code for batch ${batch.batchId}`} /><p className="eyebrow mt-5">BATCH #{batch.batchId}</p><h2 className="mt-2 font-display text-2xl">{batch.honeyType}</h2><dl className="mt-4 space-y-2 text-sm"><Info label="Apiary" value={batch.apiaryId} /><Info label="Quantity" value={batch.quantity.toString()} /><Info label="Status" value={batch.statusName} /></dl><Link className="button-primary mt-5 inline-block" to={`/verify/${batch.batchId}`}>View batch details</Link></article>)}{!error && !batches.length && <div className="rounded-2xl bg-white p-8 text-sm text-ink/50">No batches are ready for sale.</div>}</div></Shell>; }

function AdminPage() { const [form, setForm] = useState({ address: "", role: "BEEKEEPER" }); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); async function submit(e) { e.preventDefault(); setError(""); setSuccess(""); try { const result = await api("/admin/roles", { method: "POST", body: jsonBody(form) }); setSuccess(`Role assigned in transaction ${result.transactionHash}`); } catch (err) { setError(err.message); } } return <Shell><PageHeading eyebrow="ADMIN" title="Role management" /><Notice error={error} success={success} /><form onSubmit={submit} className="max-w-xl rounded-2xl bg-white p-6 shadow-soft"><label>Wallet address<input required placeholder="0x..." value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></label><label>Blockchain role<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>{["BEEKEEPER", "LAB_INSPECTOR", "PROCESSOR", "DISTRIBUTOR", "RETAILER"].map(role => <option key={role}>{role}</option>)}</select></label><button className="button-primary mt-4">Assign role</button></form></Shell>; }

function BatchPage({ publicPage = false }) { const { id } = useParams(); const [data, setData] = useState(null); const [history, setHistory] = useState([]); const [error, setError] = useState(""); useEffect(() => { Promise.all([api(`/batches/${id}/verify`), api(`/batches/${id}/history`)]).then(([v, h]) => { setData(v); setHistory(h.history); }).catch(e => setError(e.message)); }, [id]); const content = error ? <Notice error={error} /> : !data ? <p>Loading batch...</p> : (() => { const b = data.batch; return <><PageHeading eyebrow="TRACEABILITY" title={`Batch #${b.batchId}`} /><div className="grid gap-5 lg:grid-cols-[1fr_1fr]"><div className="rounded-2xl bg-white p-6 shadow-soft"><p className="eyebrow">Verified against blockchain</p><dl className="mt-5 grid grid-cols-2 gap-5 text-sm"><Info label="Honey type" value={b.honeyType} /><Info label="Apiary" value={b.apiaryId} /><Info label="Quantity" value={b.quantity.toString()} /><Info label="Status" value={b.statusName} /><Info label="Beekeeper" value={short(b.beekeeper)} /><Info label="Custodian" value={short(b.currentCustodian)} /></dl>{data.labReportUrl && <a className="mt-6 inline-block font-bold text-moss" href={data.labReportUrl} target="_blank" rel="noreferrer">View laboratory report</a>}</div><div className="rounded-2xl bg-ink p-6 text-cream"><p className="eyebrow text-honey">Custody journey</p><div className="mt-5 space-y-5">{history.map((item, index) => <div key={`${item.timestamp}-${index}`} className="border-l border-honey/50 pl-4"><p className="font-bold">{item.fromRole} → {item.toRole}</p><p className="text-sm text-cream/65">{short(item.from)} to {short(item.to)} · {item.location}</p><p className="mt-1 text-xs text-cream/45">{item.notes || "Blockchain custody record"}</p>{item.transactionHash && <p className="mt-1 break-all text-[11px] text-honey/80">tx {item.transactionHash}</p>}</div>)}</div></div></div></>; })(); return publicPage ? <div className="text-ink">{content}</div> : <Shell>{content}</Shell>; }
function Info({ label, value }) { return <div><dt className="text-xs uppercase tracking-widest text-ink/45">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function short(value) { return value ? `${value.slice(0, 7)}...${value.slice(-5)}` : "-"; }

function PublicVerify() { return <div className="min-h-screen bg-ink px-5 py-10 text-cream"><div className="mx-auto max-w-5xl"><div className="mb-8 flex items-center justify-between"><Link className="font-display text-3xl" to="/">BEEKEEPER</Link><span className="eyebrow text-honey">Public verification</span></div><BatchPage publicPage /></div></div>; }

function PublicReadyForSale() { const [batches, setBatches] = useState([]); const [error, setError] = useState(""); useEffect(() => { api("/batches/ready-for-sale").then(result => setBatches(result.batches)).catch(err => setError(err.message)); }, []); return <div className="min-h-screen bg-ink px-5 py-10 text-cream"><div className="mx-auto max-w-6xl"><div className="mb-8 flex items-center justify-between"><Link className="font-display text-3xl" to="/">BEEKEEPER</Link><span className="eyebrow text-honey">Public verification</span></div><h1 className="font-display text-5xl">Ready for sale</h1><p className="mt-3 max-w-xl text-cream/60">Scan a batch QR code to verify its blockchain history and custody journey.</p>{error && <div className="mt-6"><Notice error={error} /></div>}<div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">{batches.map(({ batch, qrCodeDataUrl, verificationUrl }) => <article key={batch.batchId} className="rounded-2xl bg-cream p-5 text-ink shadow-soft"><img className="mx-auto w-56 rounded-xl bg-white p-2" src={qrCodeDataUrl} alt={`QR code for batch ${batch.batchId}`} /><div className="mt-5"><p className="eyebrow">BATCH #{batch.batchId}</p><h2 className="mt-2 font-display text-2xl">{batch.honeyType}</h2><dl className="mt-4 space-y-2 text-sm"><Info label="Apiary" value={batch.apiaryId} /><Info label="Quantity" value={batch.quantity.toString()} /><Info label="Status" value={batch.statusName} /></dl><Link className="button-primary mt-5 inline-block" to={`/verify/${batch.batchId}`}>View verified details</Link><p className="mt-3 break-all text-[11px] text-ink/45">{verificationUrl}</p></div></article>)}{!error && !batches.length && <p className="text-cream/60">No batches are ready for sale.</p>}</div></div></div>; }

export default function App() { return <AuthProvider><Routes><Route path="/login" element={<AuthPage />} /><Route path="/register" element={<AuthPage register />} /><Route path="/verify" element={<PublicReadyForSale />} /><Route path="/verify/:id" element={<PublicVerify />} /><Route path="/" element={<Home />} /><Route path="/dashboard" element={<Protected><Dashboard /></Protected>} /><Route path="/admin" element={<Protected roles={["ADMIN"]}><AdminPage /></Protected>} /><Route path="/batches" element={<Protected><BatchesPage /></Protected>} /><Route path="/batches/create" element={<Protected roles={["BEEKEEPER"]}><CreateBatch /></Protected>} /><Route path="/batches/:id" element={<Protected><BatchPage /></Protected>} /><Route path="/eligible" element={<Protected roles={["PROCESSOR", "DISTRIBUTOR", "RETAILER"]}><BatchesPage eligible /></Protected>} /><Route path="/lab" element={<Protected roles={["LAB_INSPECTOR"]}><LabPage /></Protected>} /><Route path="/requests" element={<Protected roles={["BEEKEEPER", "PROCESSOR", "DISTRIBUTOR"]}><RequestsPage /></Protected>} /><Route path="/retailer" element={<Protected roles={["RETAILER"]}><QRPage /></Protected>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></AuthProvider>; }
function Home() { const { user } = useAuth(); return user ? <Navigate to={rolePath[user.role] || "/dashboard"} replace /> : <div className="grid min-h-screen place-items-center overflow-hidden bg-cream px-5"><div className="max-w-4xl text-center"><p className="eyebrow">BLOCKCHAIN HONEY TRACEABILITY</p><h1 className="mt-5 font-display text-6xl uppercase leading-[.82] tracking-[-.07em] text-ink sm:text-8xl md:text-[10rem]">BEEKEEPER</h1><p className="mx-auto mt-8 max-w-lg text-base text-ink/60 md:text-lg">Every jar has a story, verified from apiary to shelf.</p><div className="mt-8 flex justify-center gap-3"><Link className="button-primary" to="/login">Enter BEEKEEPER</Link><Link className="button-secondary" to="/register">Create account</Link></div></div></div>; }

export {
  AuthProvider,
  Protected,
  AuthPage,
  Home,
  Dashboard,
  CreateBatch,
  BatchesPage,
  LabPage,
  RequestsPage,
  QRPage,
  ConsumerPage,
  AdminPage,
  BatchPage,
  PublicVerify
};
