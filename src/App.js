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
  } catch (e) { console.error(e); }
}

// ── Styles ───────────────────────────────────────────────────────────────────
const S = {
  root: { minHeight: "100vh", background: "#eef2ff", fontFamily: "system-ui, sans-serif", color: "#1e3a5f" },
  center: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "linear-gradient(135deg,#c7d7fd 0%,#bfdbfe 100%)" },
  splashCard: { background: "#fff", borderRadius: 28, padding: 48, textAlign: "center", maxWidth: 420, width: "100%", boxShadow: "0 20px 60px rgba(29,78,216,0.2)" },
  card: { background: "#fff", borderRadius: 20, padding: 32, maxWidth: 420, width: "100%", boxShadow: "0 10px 30px rgba(0,0,0,0.1)" },
  page: { maxWidth: 620, margin: "0 auto", paddingBottom: 40 },
  header: { background: "linear-gradient(135deg,#1e3a8a,#0369a1)", color: "#fff", padding: "16px 20px" },
  headerInner: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: 800 },
  overallBar: { display: "flex", alignItems: "center", background: "#eff6ff", border: "1.5px solid #bfdbfe", borderRadius: 16, padding: 20, margin: "0 16px 20px" },
  tabs: { display: "flex", gap: 8, padding: "0 16px", marginBottom: 16, flexWrap: "wrap" },
  tab: { padding: "10px 16px", borderRadius: 10, cursor: "pointer", fontWeight: 600, color: "#1e40af" },
  tabActive: { background: "linear-gradient(135deg,#1d4ed8,#0369a1)", color: "#fff" },
  listWrap: { padding: "0 16px" },
  classCard: { background: "#fff", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: 16, marginBottom: 12 },
  formCard: { background: "#fff", border: "1.5px solid #bfdbfe", borderRadius: 14, padding: 18, marginBottom: 16 },
  btn: { border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 700, cursor: "pointer" },
  btnPrimary: { background: "linear-gradient(135deg,#1d4ed8,#0369a1)", color: "#fff" },
};

// Shared Components
function Btn({ onClick, label, primary = false, small = false }) {
  return (
    <button 
      onClick={onClick} 
      style={{
        ...S.btn,
        ...(primary ? S.btnPrimary : { background: "#eff6ff", color: "#1d4ed8" }),
        ...(small && { padding: "6px 14px", fontSize: 13 })
      }}
    >
      {label}
    </button>
  );
}

function Empty({ msg }) {
  return <div style={{ textAlign: "center", padding: "40px 0", color: "#666" }}>{msg}</div>;
}

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

  // Auto-save
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
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) return <div style={S.center}>Loading AttendTrack...</div>;

  return (
    <div style={S.root}>
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          padding: "12px 24px", borderRadius: 12, color: "#fff", zIndex: 1000,
          background: toast.type === "error" ? "#ef4444" : "#22c55e"
        }}>
          {toast.msg}
        </div>
      )}

      {view === "splash" && <Splash setView={setView} />}
      {view === "student" && currentStudent && <StudentDash student={currentStudent} setView={setView} showToast={showToast} />}
      {/* Add other views as you expand */}
    </div>
  );
}

function Splash({ setView }) {
  return (
    <div style={S.center}>
      <div style={S.splashCard}>
        <h1 style={{ fontSize: 42, margin: 0 }}>AttendTrack</h1>
        <p>Nwafor Orizu College of Education</p>
        <p>Department of Music</p>
        <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 12 }}>
          <Btn onClick={() => setView("sign-in")} label="I'm a Student" primary />
          <Btn onClick={() => setView("lecturer")} label="Lecturer Portal" />
          <Btn onClick={() => setView("inventory")} label="Instrument Store" />
        </div>
      </div>
    </div>
  );
}

// Placeholder for StudentDash - expand as needed
function StudentDash({ student, setView, showToast }) {
  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerInner}>
          <div style={S.headerTitle}>Welcome, {student.name}</div>
          <Btn onClick={() => setView("splash")} label="Sign Out" />
        </div>
      </div>
      <div style={{ padding: 20, textAlign: "center" }}>
        <h2>Student Dashboard</h2>
        <p>Full functionality coming soon...</p>
      </div>
    </div>
  );
}
