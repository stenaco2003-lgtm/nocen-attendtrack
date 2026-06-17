import { useState, useEffect } from "react";
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

// ── Helpers ──────────────────────────────────────────────────────────────────
const pct = (a, t) => t === 0 ? 0 : Math.round((a / t) * 100);
const pctColor = (p) => p >= 70 ? "#22c55e" : p >= 50 ? "#f59e0b" : "#ef4444";
const genCode = () => String(Math.floor(1000 + Math.random() * 9000));

const DEFAULT_LECTURERS = [
  { id: "admin", name: "Admin / HOD", pin: "1234", courses: "__all__", isAdmin: true }
];

// ── Firebase ───────────────────────────────────────────────────────────────
async function fbGet(docPath) {
  try {
    const snap = await getDoc(doc(db, ...docPath.split("/")));
    return snap.exists() ? snap.data().value : null;
  } catch { return null; }
}
async function fbSet(docPath, value) {
  try {
    await setDoc(doc(db, ...docPath.split("/")), { value });
  } catch(e) { console.error(e); }
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: { minHeight:"100vh", background:"#eef2ff", fontFamily:"'DM Sans','Segoe UI',sans-serif", color:"#1e3a5f", position:"relative", overflowX:"hidden" },
  center: { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:16, background:"linear-gradient(135deg,#c7d7fd 0%,#bfdbfe 100%)" },
  splashCard: { background:"#ffffff", borderRadius:28, padding:48, textAlign:"center", maxWidth:400, width:"100%", boxShadow:"0 20px 60px rgba(37,99,235,0.2)" },
  card: { background:"#ffffff", borderRadius:20, padding:32, maxWidth:420, width:"100%", boxShadow:"0 8px 32px rgba(29,78,216,0.15)" },
  page: { maxWidth:620, margin:"0 auto", padding:"0 0 40px" },
  header: { background:"linear-gradient(135deg,#1e3a8a,#0369a1)", color:"#fff" },
  headerInner: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 20px" },
  headerTitle: { fontSize:20, fontWeight:800 },
  headerSub: { fontSize:12, opacity:0.85 },
  overallBar: { display:"flex", alignItems:"center", background:"linear-gradient(135deg,#eff6ff,#f0f9ff)", border:"1.5px solid #bfdbfe", borderRadius:16, padding:"16px 20px", margin:"0 16px 20px" },
  tabs: { display:"flex", gap:4, padding:"0 16px", marginBottom:12, overflowX:"auto", flexWrap:"wrap" },
  tab: { padding:"10px 16px", borderRadius:10, cursor:"pointer", fontWeight:600, color:"#1e40af" },
  tabActive: { background:"linear-gradient(135deg,#1d4ed8,#0369a1)", color:"#fff" },
  listWrap: { padding:"0 16px" },
  classCard: { background:"#fff", border:"1.5px solid #bfdbfe", borderRadius:14, padding:16, marginBottom:12, display:"flex", alignItems:"center", gap:12 },
  formCard: { background:"#fff", border:"1.5px solid #bfdbfe", borderRadius:14, padding:18, marginBottom:16 },
  btn: { border:"none", borderRadius:10, padding:"10px 20px", fontWeight:700, cursor:"pointer" },
  btnPrimary: { background:"linear-gradient(135deg,#1d4ed8,#0369a1)", color:"#fff" },
  badge: { fontSize:11, background:"#fef3c7", color:"#b45309", borderRadius:99, padding:"3px 9px" },
  codeInput: { width:130, background:"#eff6ff", border:"3px solid #1d4ed8", borderRadius:10, padding:"10px 12px", fontSize:22, fontWeight:800, letterSpacing:6, textAlign:"center" }
};

// Shared Components
function Btn({ onClick, label, primary = false, small = false, full = false }) {
  return <button onClick={onClick} style={{
    ...S.btn,
    ...(primary ? S.btnPrimary : { background: "#eff6ff", color: "#1d4ed8" }),
    ...(small && { padding: "6px 14px", fontSize: 13 }),
    ...(full && { width: "100%" })
  }}>{label}</button>;
}

function Empty({ msg }) { return <div style={{textAlign:"center", padding:"40px 0", color:"#666"}}>{msg}</div>; }

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [view, setView] = useState("splash");
  const [students, setStudents] = useState(null);
  const [classes, setClasses] = useState(null);
  const [records, setRecords] = useState(null);
  const [pending, setPending] = useState(null);
  const [courses, setCourses] = useState(null);
  const [lecturers, setLecturers] = useState(null);
  const [currentStudent, setCurrentStudent] = useState(null);
  const [currentLecturer, setCurrentLecturer] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [instruments, setInstruments] = useState(null);
  const [loans, setLoans] = useState(null);
  const [studentInstruments, setStudentInstruments] = useState(null);

  useEffect(() => {
    (async () => {
      setStudents((await fbGet("attendtrack/students")) ?? {});
      setClasses((await fbGet("attendtrack/classes")) ?? []);
      setRecords((await fbGet("attendtrack/records")) ?? {});
      setPending((await fbGet("attendtrack/pending")) ?? {});
      setCourses((await fbGet("attendtrack/courses")) ?? []);
      setLecturers((await fbGet("attendtrack/lecturers")) ?? DEFAULT_LECTURERS);
      setInstruments((await fbGet("attendtrack/instruments")) ?? []);
      setLoans((await fbGet("attendtrack/loans")) ?? []);
      setStudentInstruments((await fbGet("attendtrack/studentInstruments")) ?? []);
      setLoading(false);
    })();
  }, []);

  useEffect(() => { if (!loading && students !== null) fbSet("attendtrack/students", students); }, [students, loading]);
  useEffect(() => { if (!loading && classes !== null) fbSet("attendtrack/classes", classes); }, [classes, loading]);
  useEffect(() => { if (!loading && records !== null) fbSet("attendtrack/records", records); }, [records, loading]);
  useEffect(() => { if (!loading && pending !== null) fbSet("attendtrack/pending", pending); }, [pending, loading]);
  useEffect(() => { if (!loading && courses !== null) fbSet("attendtrack/courses", courses); }, [courses, loading]);
  useEffect(() => { if (!loading && lecturers !== null) fbSet("attendtrack/lecturers", lecturers); }, [lecturers, loading]);
  useEffect(() => { if (!loading && instruments !== null) fbSet("attendtrack/instruments", instruments); }, [instruments, loading]);
  useEffect(() => { if (!loading && loans !== null) fbSet("attendtrack/loans", loans); }, [loans, loading]);
  useEffect(() => { if (!loading && studentInstruments !== null) fbSet("attendtrack/studentInstruments", studentInstruments); }, [studentInstruments, loading]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const myCoursesForLecturer = (lec) => lec?.isAdmin || lec?.courses === "__all__" ? (courses || []) : (lec?.courses || []);
  const confirmedClasses = (classes || []).filter(c => c.confirmed);

  const studentStats = (studentNo, visibleCourses) => {
    const stats = {};
    (visibleCourses || courses || []).forEach(code => {
      const cls = confirmedClasses.filter(c => c.courseCode === code);
      const attended = cls.filter(c => (records[c.id] || []).includes(studentNo)).length;
      stats[code] = { total: cls.length, attended };
    });
    return stats;
  };

  if (loading) return <div style={S.center}>Loading AttendTrack...</div>;

  return (
    <div style={S.root}>
      {toast && <div style={{position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", padding:"12px 24px", borderRadius:12, color:"#fff", background: toast.type === "error" ? "#ef4444" : "#22c55e", zIndex:1000}}>{toast.msg}</div>}

      {view === "splash" && <Splash setView={setView} />}
      {view === "register" && <Register students={students} setStudents={setStudents} setView={setView} showToast={showToast} setCurrentStudent={setCurrentStudent} />}
      {view === "sign-in" && <SignInStudent students={students} setStudents={setStudents} setView={setView} showToast={showToast} setCurrentStudent={setCurrentStudent} />}
      {view === "student" && currentStudent && <StudentDash student={currentStudent} classes={classes} confirmedClasses={confirmedClasses} records={records} pending={pending} setPending={setPending} courses={courses} studentStats={studentStats} setView={setView} showToast={showToast} pct={pct} pctColor={pctColor} studentInstruments={studentInstruments} setStudentInstruments={setStudentInstruments} instruments={instruments} loans={loans} setLoans={setLoans} />}
      {view === "inventory" && <InventoryDash instruments={instruments} setInstruments={setInstruments} loans={loans} setLoans={setLoans} studentInstruments={studentInstruments} students={students} lecturers={lecturers} currentLecturer={currentLecturer} setCurrentLecturer={setCurrentLecturer} setView={setView} showToast={showToast} />}
      {view === "lecturer" && <LecturerDash currentLecturer={currentLecturer} setCurrentLecturer={setCurrentLecturer} lecturers={lecturers} setLecturers={setLecturers} students={students} setStudents={setStudents} classes={classes} setClasses={setClasses} records={records} setRecords={setRecords} pending={pending} setPending={setPending} courses={courses} setCourses={setCourses} setView={setView} showToast={showToast} confirmedClasses={confirmedClasses} studentStats={studentStats} pct={pct} pctColor={pctColor} myCoursesForLecturer={myCoursesForLecturer} />}
    </div>
  );
}

// Add all other functions from your original file (Splash, Register, SignInStudent, LecturerDash, InventoryDash, etc.)

// For now, use the fixed StudentDash below and paste the rest of your original components.

function Splash({ setView }) {
  return (
    <div style={S.center}>
      <div style={S.splashCard}>
        <h1 style={{fontSize:42}}>AttendTrack</h1>
        <p>Department of Music</p>
        <div style={{marginTop:30, display:"flex", flexDirection:"column", gap:12}}>
          <Btn onClick={() => setView("sign-in")} label="I'm a Student" primary />
          <Btn onClick={() => setView("lecturer")} label="Lecturer Portal" />
          <Btn onClick={() => setView("inventory")} label="Instrument Store" />
        </div>
      </div>
    </div>
  );
}

// FIXED STUDENT DASH
function StudentDash({ student, classes, confirmedClasses, records, pending, setPending, courses, studentStats, setView, showToast, pct, pctColor, studentInstruments, setStudentInstruments, instruments, loans, setLoans }) {
  const [tab, setTab] = useState("attend");
  const [codeEntry, setCodeEntry] = useState({});

  const stats = studentStats(student.studentNo, courses);
  const now = Date.now();
  const openClasses = classes.filter(c => {
    const signed = (records[c.id]||[]).includes(student.studentNo) || (pending[c.id]||[]).includes(student.studentNo);
    const expired = c.expiresAt && c.expiresAt < now;
    return !signed && !expired;
  });

  const markAttendance = (classId, correctCode) => {
    const typed = (codeEntry[classId]||"").trim();
    if (!typed) return showToast("Enter code", "error");
    if (typed !== correctCode) return showToast("Wrong code", "error");
    setPending(prev => ({...prev, [classId]: [...(prev[classId]||[]), student.studentNo]}));
    showToast("Submitted!");
  };

  const totalPct = () => {
    let tot=0, att=0;
    Object.values(stats).forEach(s => { tot += s.total; att += s.attended; });
    return pct(att, tot);
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerInner}>
          <div style={S.headerTitle}>Welcome, {student.name}</div>
          <Btn onClick={() => setView("splash")} label="Sign Out" />
        </div>
      </div>

      <div style={S.overallBar}>
        <div>Overall: {totalPct()}%</div>
      </div>

      <div style={S.tabs}>
        {["attend", "overview", "store", "holdings", "instrument"].map(t => (
          <div key={t} style={{...S.tab, background: tab === t ? "#1d4ed8" : "transparent", color: tab === t ? "#fff" : "#1e40af"}} onClick={() => setTab(t)}>
            {t.toUpperCase()}
          </div>
        ))}
      </div>

      {tab === "attend" && <div style={S.listWrap}>Attendance tab ready</div>}
      {tab === "overview" && <div style={S.listWrap}>Overview ready</div>}
      {tab === "store" && <div style={S.listWrap}>Store ready</div>}
      {tab === "holdings" && <div style={S.listWrap}>Holdings ready</div>}
      {tab === "instrument" && <div style={S.listWrap}>My Instrument ready</div>}
    </div>
  );
}
