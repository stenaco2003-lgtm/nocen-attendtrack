import React, { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, onSnapshot, collection,
  deleteDoc
} from "firebase/firestore";

// Top-level error boundary — if anything crashes, show a message instead of
// a dark screen so the problem is at least visible and diagnosable
class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:40,fontFamily:"sans-serif",color:"#1e3a5f",background:"#eef2ff",minHeight:"100vh"}}>
          <h2>AttendTrack — Something went wrong</h2>
          <p style={{marginTop:12,color:"#dc2626"}}>{String(this.state.error)}</p>
          <p style={{marginTop:16,fontSize:13,color:"#4b6cb7"}}>Please take a screenshot of this page and send it. Then tap below to reload.</p>
          <button onClick={()=>window.location.reload()} style={{marginTop:20,padding:"10px 24px",background:"#1d4ed8",color:"#fff",border:"none",borderRadius:8,fontSize:14,cursor:"pointer"}}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const pct = (a, t) => t === 0 ? 0 : Math.round((a / t) * 100);
const pctColor = (p) => p >= 70 ? "#22c55e" : p >= 50 ? "#f59e0b" : "#ef4444";
const genCode = () => String(Math.floor(1000 + Math.random() * 9000));

const DEFAULT_LECTURERS = [
  { id: "admin", name: "Admin / HOD", pin: "1234", courses: "__all__", isAdmin: true }
];

// ── Document-per-record Firebase layer ───────────────────────────────────────
// Each logical record (student, class session, lecturer, etc.) is stored as
// its own Firestore document. This means two lecturers can write simultaneously
// without ever conflicting — they're always writing to different documents.
//
// Collection structure:
//   at_students/{studentNo}         — one doc per student
//   at_classes/{classId}            — one doc per class session
//   at_records/{classId}            — attendance list per class
//   at_pending/{classId}            — pending list per class
//   at_courses/_list                — single doc (small, rarely written)
//   at_lecturers/{lecturerId}       — one doc per lecturer
//   at_instruments/{instId}         — one doc per instrument
//   at_loans/{loanId}               — one doc per loan
//   at_studentInstruments/{id}      — one doc per student instrument

// Subscribe to an entire collection and return it as an object keyed by doc ID.
// Calls onChange whenever any document in the collection changes.
function subscribeCollection(colName, onChange, onReady) {
  try {
    const colRef = collection(db, colName);
    let ready = false;
    return onSnapshot(colRef, (snap) => {
      const result = {};
      snap.forEach(d => { result[d.id] = d.data(); });
      onChange(result);
      if (!ready) { ready = true; onReady && onReady(); }
    }, (err) => {
      console.error("Listener error for", colName, err);
      onChange({});
      if (!ready) { ready = true; onReady && onReady(); }
    });
  } catch(e) {
    console.error("subscribeCollection failed for", colName, e);
    onChange({});
    onReady && onReady();
    return () => {};
  }
}

function subscribeDoc(colName, docId, onChange, onReady, fallback) {
  try {
    const ref = doc(db, colName, docId);
    let ready = false;
    return onSnapshot(ref, (snap) => {
      onChange(snap.exists() ? snap.data() : fallback);
      if (!ready) { ready = true; onReady && onReady(); }
    }, (err) => {
      console.error("Listener error for", colName, docId, err);
      onChange(fallback);
      if (!ready) { ready = true; onReady && onReady(); }
    });
  } catch(e) {
    console.error("subscribeDoc failed for", colName, docId, e);
    onChange(fallback);
    onReady && onReady();
    return () => {};
  }
}

// Write a single record document. Each call only touches one document
// so concurrent writes from different lecturers never conflict.
async function writeDoc(colName, docId, data) {
  try {
    await setDoc(doc(db, colName, docId), data);
  } catch(e) { console.error("writeDoc error", colName, docId, e); }
}

// Delete a single record document.
async function deleteRec(colName, docId) {
  try {
    await deleteDoc(doc(db, colName, docId));
  } catch(e) { console.error("deleteRec error", colName, docId, e); }
}

// Student attendance submission — safe additive write to one pending document.
// Only touches at_pending/{classId}, never any other collection.
async function fbAddToPending(classId, studentNo) {
  try {
    const ref = doc(db, "at_pending", classId);
    const snap = await getDoc(ref);
    const list = snap.exists() ? (snap.data().list || []) : [];
    if (list.includes(studentNo)) return;
    await setDoc(ref, { list: [...list, studentNo] });
  } catch(e) { console.error("fbAddToPending error", e); }
}

// ── Shape converters — translate collection snapshots to app state format ────
// Students: { studentNo: studentObject }
const studentsFromSnap  = (snap) => {
  const out = {};
  Object.values(snap).forEach(s => { if (s.studentNo) out[s.studentNo] = s; });
  return out;
};
// Classes: array sorted by date desc
const classesFromSnap   = (snap) => Object.values(snap).sort((a,b) => b.date?.localeCompare(a.date||"")||0);
// Records: { classId: [studentNo, ...] }
const recordsFromSnap   = (snap) => { const out={}; Object.entries(snap).forEach(([id,d])=>{ out[id]=d.list||[]; }); return out; };
// Pending: { classId: [studentNo, ...] }
const pendingFromSnap   = (snap) => { const out={}; Object.entries(snap).forEach(([id,d])=>{ out[id]=d.list||[]; }); return out; };
// Lecturers: array
const lecturersFromSnap = (snap) => {
  const arr = Object.values(snap);
  if (arr.length === 0) return DEFAULT_LECTURERS;
  return arr;
};
// Instruments: array
const instrumentsFromSnap      = (snap) => Object.values(snap);
// Loans: array
const loansFromSnap            = (snap) => Object.values(snap);
// Student instruments: array
const studentInstFromSnap      = (snap) => Object.values(snap);

// ═══════════════════════════════════════════════════════════════════════════════
function AppInner() {
  const [view, setView]             = useState("splash");
  const [students, setStudents]     = useState(null);
  const [classes, setClasses]       = useState(null);
  const [records, setRecords]       = useState(null);
  const [pending, setPending]       = useState(null);
  const [courses, setCourses]       = useState(null);
  const [lecturers, setLecturers]   = useState(null);
  const [currentStudent, setCurrentStudent] = useState(null);
  const [currentLecturer, setCurrentLecturer] = useState(null);
  const [toast, setToast]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [instruments, setInstruments]           = useState(null);
  const [loans, setLoans]                       = useState(null);
  const [studentInstruments, setStudentInstruments] = useState(null);

  const currentLecturerRef = useRef(null);
  useEffect(() => { currentLecturerRef.current = currentLecturer; }, [currentLecturer]);

  // ── Live listeners — one per Firestore collection ─────────────────────────
  useEffect(() => {
    const loaded = new Set();
    const unsubs = [];
    const mark = (key) => { loaded.add(key); if (loaded.size >= 9) setLoading(false); };

    unsubs.push(subscribeCollection("at_students",           s => setStudents(studentsFromSnap(s)),            () => mark("students")));
    unsubs.push(subscribeCollection("at_classes",            s => setClasses(classesFromSnap(s)),              () => mark("classes")));
    unsubs.push(subscribeCollection("at_records",            s => setRecords(recordsFromSnap(s)),              () => mark("records")));
    unsubs.push(subscribeCollection("at_pending",            s => setPending(pendingFromSnap(s)),              () => mark("pending")));
    unsubs.push(subscribeCollection("at_lecturers",          s => setLecturers(lecturersFromSnap(s)),          () => mark("lecturers")));
    unsubs.push(subscribeCollection("at_instruments",        s => setInstruments(instrumentsFromSnap(s)),      () => mark("instruments")));
    unsubs.push(subscribeCollection("at_loans",              s => setLoans(loansFromSnap(s)),                  () => mark("loans")));
    unsubs.push(subscribeCollection("at_studentInstruments", s => setStudentInstruments(studentInstFromSnap(s)), () => mark("studentInstruments")));
    unsubs.push(subscribeDoc("at_courses", "_list",          d => setCourses(d.list || []),                   () => mark("courses"), { list: [] }));

    const t = setTimeout(() => setLoading(false), 8000);
    return () => { unsubs.forEach(u => u()); clearTimeout(t); };
  }, []);


  // Automatic daily safety snapshot — separate from the manual download backup.
  // Runs at most once per calendar day, only once every collection has genuinely
  // loaded (never on a partially-loaded state), and only while an Admin is logged
  // in. Writes to a SEPARATE Firestore path so it can never collide with or
  // overwrite the live data paths. Keeps a rolling 7-day history.
  useEffect(() => {
    const allReady = ["students","classes","records","pending","courses","lecturers","instruments","loans","studentInstruments"]
      .every(key => collectionReady.current[key]);
    const isAdminLoggedIn = currentLecturer?.isAdmin || currentLecturer?.courses === "__all__";
    if (!allReady || !isAdminLoggedIn) return;

    const today = new Date().toISOString().slice(0, 10);
    (async () => {
      try {
        const lastSnap = await getDoc(doc(db, "at_autobackups", "_last"));
        const lastAuto = lastSnap.exists() ? lastSnap.data().date : null;
        if (lastAuto === today) return; // already snapshotted today
        const snapshot = {
          version: "1.1",
          exportedAt: new Date().toISOString(),
          data: {
            students: students || {}, classes: classes || [], records: records || {},
            pending: pending || {}, courses: courses || [], lecturers: lecturers || [],
            instruments: instruments || [], loans: loans || [], studentInstruments: studentInstruments || []
          }
        };
        // Store in a simple top-level backup doc, not the live collection paths
        await writeDoc("at_autobackups", today, snapshot);
        await writeDoc("at_autobackups", "_last", { date: today });
        // Prune old backup
        const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
        await deleteRec("at_autobackups", cutoff.toISOString().slice(0, 10)).catch(() => {});
      } catch (e) { console.error("Auto-backup failed:", e); }
    })();
  }, [currentLecturer, students, classes, records, pending, courses, lecturers, instruments, loans, studentInstruments]);

  // ── Write-through helpers ─────────────────────────────────────────────────
  // Every mutation updates local state (for instant UI) AND writes the specific
  // changed document to Firestore. Only lecturer/admin sessions call these.

  const saveStudent = (student) => {
    setStudents(prev => ({ ...prev, [student.studentNo]: student }));
    writeDoc("at_students", student.studentNo, student);
  };

  const saveClass = (cls) => {
    setClasses(prev => { const existing = prev.find(c=>c.id===cls.id); return existing ? prev.map(c=>c.id===cls.id?cls:c) : [...prev, cls]; });
    writeDoc("at_classes", cls.id, cls);
  };

  const deleteClass = (classId) => {
    setClasses(prev => prev.filter(c => c.id !== classId));
    setRecords(prev => { const n={...prev}; delete n[classId]; return n; });
    setPending(prev => { const n={...prev}; delete n[classId]; return n; });
    deleteRec("at_classes", classId);
    deleteRec("at_records", classId);
    deleteRec("at_pending", classId);
  };

  const saveRecord = (classId, list) => {
    setRecords(prev => ({ ...prev, [classId]: list }));
    writeDoc("at_records", classId, { list });
  };

  const savePendingForClass = (classId, list) => {
    setPending(prev => ({ ...prev, [classId]: list }));
    if (list.length === 0) {
      deleteRec("at_pending", classId);
    } else {
      writeDoc("at_pending", classId, { list });
    }
  };

  const saveCourses = (list) => {
    setCourses(list);
    writeDoc("at_courses", "_list", { list });
  };

  const saveLecturer = (lec) => {
    setLecturers(prev => { const existing = prev.find(l=>l.id===lec.id); return existing ? prev.map(l=>l.id===lec.id?lec:l) : [...prev, lec]; });
    writeDoc("at_lecturers", lec.id, lec);
  };

  const deleteLecturer = (id) => {
    setLecturers(prev => prev.filter(l => l.id !== id));
    deleteRec("at_lecturers", id);
  };

  const saveInstrument = (inst) => {
    setInstruments(prev => { const existing = (prev||[]).find(i=>i.id===inst.id); return existing ? (prev||[]).map(i=>i.id===inst.id?inst:i) : [...(prev||[]), inst]; });
    writeDoc("at_instruments", inst.id, inst);
  };

  const deleteInstrument = (id) => {
    setInstruments(prev => (prev||[]).filter(i => i.id !== id));
    deleteRec("at_instruments", id);
  };

  const saveLoan = (loan) => {
    setLoans(prev => { const existing = (prev||[]).find(l=>l.id===loan.id); return existing ? (prev||[]).map(l=>l.id===loan.id?loan:l) : [...(prev||[]), loan]; });
    writeDoc("at_loans", loan.id, loan);
  };

  const saveStudentInstrument = (inst) => {
    setStudentInstruments(prev => { const existing = (prev||[]).find(i=>i.id===inst.id); return existing ? (prev||[]).map(i=>i.id===inst.id?inst:i) : [...(prev||[]), inst]; });
    writeDoc("at_studentInstruments", inst.id, inst);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const myCoursesForLecturer = (lec) =>
    lec?.isAdmin || lec?.courses === "__all__" ? (courses || []) : (lec?.courses || []);

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

  if (loading) return (
    <div style={{...S.center, flexDirection:"column", gap:16}}>
      <div style={S.logo}>◈</div>
      <div style={{color:"#1d4ed8", fontSize:14, fontWeight:600}}>Loading AttendTrack...</div>
    </div>
  );

  return (
    <div style={S.root}>
      <div style={S.grain} />
      {toast && (
        <div style={{ ...S.toast, background: toast.type === "error" ? "#ef4444" : "#16a34a" }}>
          {toast.msg}
        </div>
      )}
      {view === "splash"   && <Splash setView={setView} />}
      {view === "register" && <Register students={students} saveStudent={saveStudent} setView={setView} showToast={showToast} setCurrentStudent={setCurrentStudent} />}
      {view === "sign-in"  && <SignInStudent students={students} saveStudent={saveStudent} setView={setView} showToast={showToast} setCurrentStudent={setCurrentStudent} />}
      {view === "student"  && currentStudent && (
        <StudentDash student={currentStudent} classes={classes} confirmedClasses={confirmedClasses}
          records={records} pending={pending} courses={courses}
          studentStats={studentStats} setView={setView} showToast={showToast} pct={pct} pctColor={pctColor}
          studentInstruments={studentInstruments} saveStudentInstrument={saveStudentInstrument}
          instruments={instruments} loans={loans} saveLoan={saveLoan} />
      )}
      {view === "inventory" && (
        <InventoryDash
          instruments={instruments} saveInstrument={saveInstrument} deleteInstrument={deleteInstrument}
          loans={loans} saveLoan={saveLoan}
          studentInstruments={studentInstruments} saveStudentInstrument={saveStudentInstrument}
          students={students} lecturers={lecturers}
          currentLecturer={currentLecturer} setCurrentLecturer={setCurrentLecturer}
          setView={setView} showToast={showToast} isAdmin={currentLecturer?.isAdmin||false} />
      )}
      {view === "lecturer" && (
        <LecturerDash currentLecturer={currentLecturer} setCurrentLecturer={setCurrentLecturer}
          lecturers={lecturers} saveLecturer={saveLecturer} deleteLecturer={deleteLecturer}
          students={students} saveStudent={saveStudent}
          classes={classes} saveClass={saveClass} deleteClass={deleteClass}
          records={records} saveRecord={saveRecord}
          pending={pending} savePendingForClass={savePendingForClass}
          courses={courses} saveCourses={saveCourses}
          instruments={instruments} saveInstrument={saveInstrument} deleteInstrument={deleteInstrument}
          loans={loans} saveLoan={saveLoan}
          studentInstruments={studentInstruments} saveStudentInstrument={saveStudentInstrument}
          setView={setView} showToast={showToast} confirmedClasses={confirmedClasses}
          studentStats={studentStats} pct={pct} pctColor={pctColor}
          myCoursesForLecturer={myCoursesForLecturer} />
      )}
    </div>
  );
}

// ── Splash ────────────────────────────────────────────────────────────────────
// ── Install Prompt (PWA) ──────────────────────────────────────────────────────
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !window.MSStream;
}

function InstallPrompt() {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("attendtrack_install_dismissed") === "1");
  const [deferredEvent, setDeferredEvent] = useState(null);
  const [showIOSHelp, setShowIOSHelp] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredEvent(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isStandalone() || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem("attendtrack_install_dismissed", "1");
    setDismissed(true);
  };

  const handleInstallClick = async () => {
    if (deferredEvent) {
      deferredEvent.prompt();
      const { outcome } = await deferredEvent.userChoice;
      if (outcome === "accepted") setDismissed(true);
      setDeferredEvent(null);
    } else if (isIOS()) {
      setShowIOSHelp(true);
    }
  };

  // Don't show anything if neither an Android install prompt is available nor on iOS
  if (!deferredEvent && !isIOS()) return null;

  if (showIOSHelp) {
    return (
      <div style={S.installBanner}>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:13,color:"#1e3a5f",marginBottom:4}}>📲 Add AttendTrack to your Home Screen</div>
          <div style={{fontSize:12,color:"#1e40af",lineHeight:1.5}}>
            1. Tap the <strong>Share</strong> icon at the bottom of Safari<br/>
            2. Scroll down and tap <strong>"Add to Home Screen"</strong><br/>
            3. Tap <strong>"Add"</strong> in the top corner
          </div>
          <div style={{fontSize:11,color:"#4b6cb7",marginTop:6,fontStyle:"italic"}}>This only works in Safari, not Chrome or other browsers on iPhone.</div>
        </div>
        <span style={{cursor:"pointer",fontSize:18,color:"#94a3b8",flexShrink:0,marginLeft:8}} onClick={dismiss}>✕</span>
      </div>
    );
  }

  return (
    <div style={S.installBanner}>
      <div style={{flex:1}}>
        <div style={{fontWeight:700,fontSize:13,color:"#1e3a5f",marginBottom:2}}>📲 Install AttendTrack</div>
        <div style={{fontSize:12,color:"#1e40af"}}>Add it to your home screen for quick, full-screen access.</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,marginLeft:8}}>
        <Btn onClick={handleInstallClick} label="Install" primary small />
        <span style={{cursor:"pointer",fontSize:18,color:"#94a3b8"}} onClick={dismiss}>✕</span>
      </div>
    </div>
  );
}

function Splash({ setView }) {
  return (
    <div style={S.center}>
      <div style={S.splashCard}>
        <div style={S.logoCrest}>
          <img src="/nocen-logo.jpg" alt="NOCEN Logo" style={{width:"100%",height:"100%",objectFit:"contain",borderRadius:"50%"}} onError={e=>{e.target.style.display="none"}} />
        </div>
        <div style={S.schoolName}>Nwafor Orizu College of Education</div>
        <div style={S.deptName}>Department of Music · Nsugbe</div>
        <h1 style={S.splashTitle}>AttendTrack</h1>
        <p style={S.splashSub}>Semester Attendance Management System</p>
        <div style={{ display:"flex", gap:12, marginTop:28, flexWrap:"wrap", justifyContent:"center" }}>
          <Btn onClick={() => setView("sign-in")} label="I'm a Student" icon="🎓" primary />
          <Btn onClick={() => setView("lecturer")} label="Lecturer Portal" icon="🔐" />
          <Btn onClick={() => setView("inventory")} label="Instrument Store" icon="🎸" />
        </div>
        <div style={S.copyright}>© Nwafor Orizu College of Education 2026</div>
      </div>
      <InstallPrompt />
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────
function Register({ students, saveStudent, setView, showToast, setCurrentStudent }) {
  const [name, setName]       = useState("");
  const [sno, setSno]         = useState("");
  const [pwd, setPwd]         = useState("");
  const [pwd2, setPwd2]       = useState("");
  const [dept, setDept]       = useState("music");
  const submit = () => {
    if (!name.trim() || !sno.trim()) return showToast("Please fill all fields", "error");
    if (!pwd.trim()) return showToast("Please create a password", "error");
    if (pwd.length < 4) return showToast("Password must be at least 4 characters", "error");
    if (pwd !== pwd2) return showToast("Passwords do not match", "error");
    if (students[sno.trim()]) return showToast("Student number already registered", "error");
    const student = { name: name.trim(), studentNo: sno.trim(), password: pwd, department: dept };
    saveStudent(student);
    setCurrentStudent(student);
    showToast("Registration successful! Welcome, " + name.split(" ")[0]);
    setView("student");
  };
  return (
    <div style={S.center}>
      <div style={S.card}>
        <BackBtn onClick={() => setView("splash")} />
        <h2 style={S.cardTitle}>New Student Registration</h2>
        <p style={S.cardSub}>First-time? Set up your attendance profile.</p>
        <Field label="Full Name" value={name} onChange={setName} placeholder="e.g. Chukwuemeka Obi" />
        <Field label="Student Number" value={sno} onChange={setSno} placeholder="e.g. 2021/001234" />
        <div style={{marginBottom:16}}>
          <label style={S.label}>Department</label>
          <div style={{display:"flex",gap:8}}>
            <div onClick={()=>setDept("music")} style={{flex:1,padding:"10px 14px",borderRadius:10,cursor:"pointer",textAlign:"center",fontSize:13,fontWeight:700,
              background:dept==="music"?"linear-gradient(135deg,#1d4ed8,#0369a1)":"#f0f7ff",
              color:dept==="music"?"#fff":"#1d4ed8",
              border:dept==="music"?"none":"1.5px solid #93c5fd"}}>
              🎵 Music Dept
            </div>
            <div onClick={()=>setDept("borrowed")} style={{flex:1,padding:"10px 14px",borderRadius:10,cursor:"pointer",textAlign:"center",fontSize:13,fontWeight:700,
              background:dept==="borrowed"?"linear-gradient(135deg,#0369a1,#0891b2)":"#f0f7ff",
              color:dept==="borrowed"?"#fff":"#1d4ed8",
              border:dept==="borrowed"?"none":"1.5px solid #93c5fd"}}>
              📚 Borrowed Course
            </div>
          </div>
        </div>
        <Field label="Create Password" value={pwd} onChange={setPwd} placeholder="Minimum 4 characters" type="password" />
        <Field label="Confirm Password" value={pwd2} onChange={setPwd2} placeholder="Re-enter your password" type="password" />
        <Btn onClick={submit} label="Register & Continue" primary full />
      </div>
    </div>
  );
}

// ── Sign In Student ───────────────────────────────────────────────────────────
function SignInStudent({ students, saveStudent, setView, showToast, setCurrentStudent }) {
  const [sno, setSno]       = useState("");
  const [pwd, setPwd]       = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [foundStudent, setFoundStudent]   = useState(null);

  const checkStudent = () => {
    if (!sno.trim()) return;
    const student = students[sno.trim()];
    if (!student) { showToast("Student number not found. Please register first.", "error"); return; }
    if (!student.password) {
      setFoundStudent(student);
      setNeedsPassword(true);
      return;
    }
    setFoundStudent(student);
  };

  const go = () => {
    if (!foundStudent) return checkStudent();
    if (!pwd.trim()) return showToast("Please enter your password", "error");
    if (pwd !== foundStudent.password) return showToast("Incorrect password. Please try again.", "error");
    setCurrentStudent(foundStudent);
    showToast("Welcome back, " + foundStudent.name.split(" ")[0] + "!");
    setView("student");
  };

  const setFirstPassword = () => {
    if (!newPwd.trim()) return showToast("Please create a password", "error");
    if (newPwd.length < 4) return showToast("Password must be at least 4 characters", "error");
    if (newPwd !== newPwd2) return showToast("Passwords do not match", "error");
    const updated = { ...foundStudent, password: newPwd };
    saveStudent(updated);
    setCurrentStudent(updated);
    showToast("Password set! Welcome back, " + foundStudent.name.split(" ")[0] + "!");
    setView("student");
  };

  if (needsPassword && foundStudent) {
    return (
      <div style={S.center}>
        <div style={S.card}>
          <BackBtn onClick={() => { setNeedsPassword(false); setFoundStudent(null); setSno(""); }} />
          <h2 style={S.cardTitle}>Create Your Password</h2>
          <p style={S.cardSub}>Hello {foundStudent.name.split(" ")[0]}! For your security, please create a password for your account.</p>
          <Field label="New Password" value={newPwd} onChange={setNewPwd} placeholder="Minimum 4 characters" type="password" />
          <Field label="Confirm Password" value={newPwd2} onChange={setNewPwd2} placeholder="Re-enter your password" type="password" />
          <Btn onClick={setFirstPassword} label="Set Password & Continue" primary full />
        </div>
      </div>
    );
  }

  return (
    <div style={S.center}>
      <div style={S.card}>
        <BackBtn onClick={() => setView("splash")} />
        <h2 style={S.cardTitle}>Student Sign-In</h2>
        <p style={S.cardSub}>Enter your student number and password.</p>
        <Field label="Student Number" value={sno} onChange={v=>{ setSno(v); setFoundStudent(null); setPwd(""); }} placeholder="e.g. 2021/001234" />
        {foundStudent && <Field label="Password" value={pwd} onChange={setPwd} placeholder="Enter your password" type="password" />}
        <Btn onClick={foundStudent ? go : checkStudent} label={foundStudent ? "Sign In" : "Continue"} primary full />
        <p style={{ textAlign:"center", marginTop:16, fontSize:13, color:"#4b6cb7" }}>
          First time? <span style={{ color:"#1d4ed8", cursor:"pointer", fontWeight:700 }} onClick={() => setView("register")}>Register here</span>
        </p>
      </div>
    </div>
  );
}

// ── Student Countdown ─────────────────────────────────────────────────────────
function StudentCountdown({ expiresAt }) {
  const [remaining, setRemaining] = useState(Math.max(0, expiresAt - Date.now()));
  useEffect(() => {
    const iv = setInterval(() => { setRemaining(Math.max(0, expiresAt - Date.now())); }, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);
  if (remaining <= 0) return <span style={{fontSize:11,color:"#ef4444",fontWeight:700}}>⏰ Sign-in window closed</span>;
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return <span style={{fontSize:12,color:remaining<60000?"#ef4444":"#16a34a",fontWeight:700}}>⏱ {mins}:{String(secs).padStart(2,"0")} remaining</span>;
}

// ── Student Dashboard ─────────────────────────────────────────────────────────
function StudentDash({ student, classes, confirmedClasses, records, pending, courses, studentStats, setView, showToast, pct, pctColor, studentInstruments, saveStudentInstrument, instruments, loans, saveLoan }) {
  const [tab, setTab] = useState("attend");
  const [codeEntry, setCodeEntry] = useState({});
  const stats = studentStats(student.studentNo, courses);

  const now = Date.now();
  const openClasses = classes.filter(c => {
    const signed = (records[c.id]||[]).includes(student.studentNo) || (pending[c.id]||[]).includes(student.studentNo);
    const expired = c.expiresAt && c.expiresAt < now;
    return !signed && !expired;
  });

  const markAttendance = async (classId, correctCode) => {
    const typed = (codeEntry[classId]||"").trim();
    if (!typed) return showToast("Please enter the attendance code", "error");
    if (typed !== correctCode) return showToast("Incorrect code. Check the board and try again.", "error");
    // Use the safe student-only write — this ONLY touches pending for this one
    // class and never triggers a full dataset save from the student's browser.
    await fbAddToPending(classId, student.studentNo);
    showToast("Attendance submitted! Awaiting lecturer confirmation.");
  };

  const totalPct = () => {
    let tot=0,att=0;
    Object.values(stats).forEach(s=>{tot+=s.total;att+=s.attended;});
    return pct(att,tot);
  };

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerInner}>
          <div>
            <div style={S.headerTitle}>AttendTrack</div>
            <div style={S.headerSub}>NOCEN Music Dept · Welcome, {student.name}</div>
          </div>
          <Btn onClick={() => setView("splash")} label="Sign Out" small />
        </div>
      </div>
      <div style={S.overallBar}>
        <Ring pct={totalPct()} size={80} />
        <div style={{ marginLeft:20 }}>
          <div style={{ fontSize:13, color:"#1e40af", marginBottom:2, fontWeight:600 }}>Overall Attendance</div>
          <div style={{ fontSize:28, fontWeight:800, color:pctColor(totalPct()) }}>{totalPct()}%</div>
          <div style={{ fontSize:11, color: totalPct()>=70?"#16a34a":"#dc2626", fontWeight:700 }}>
            {totalPct()>=70?"✓ Satisfactory":"⚠ Below Required 70%"}
          </div>
        </div>
      </div>
      <div style={{...S.tabs,flexWrap:"wrap"}}>
        {[["attend","📋 Attendance"],["overview","📊 Overview"],["store","🏛 Store"],["holdings","🎓 Holdings"],["instrument","🎸 My Instrument"]].map(([t,l])=>(
          <div key={t} style={{...S.tab,...(tab===t?S.tabActive:{})}} onClick={()=>setTab(t)}>
            {l}
          </div>
        ))}
      </div>
      {tab==="attend" && (
        <div style={S.listWrap}>
          {openClasses.length===0 ? <Empty msg="No open classes to sign right now." /> :
            openClasses.map(cls=>(
              <div key={cls.id} style={S.classCard}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f"}}>{cls.courseCode}</div>
                  <div style={{fontSize:13,color:"#4b6cb7",marginTop:2}}>{cls.topic||"Class"} · {cls.date}</div>
                  {!cls.confirmed && <span style={S.badge}>Pending confirmation</span>}
                  {cls.confirmed && cls.expiresAt && <div style={{marginTop:4}}><StudentCountdown expiresAt={cls.expiresAt}/></div>}
                </div>
                {cls.confirmed
                  ? <div style={{display:"flex",flexDirection:"column",gap:6,alignItems:"flex-end",minWidth:130}}>
                      <input style={S.codeInput} placeholder="Enter code" maxLength={4}
                        value={codeEntry[cls.id]||""}
                        onChange={e=>setCodeEntry(prev=>({...prev,[cls.id]:e.target.value}))} />
                      <Btn onClick={()=>markAttendance(cls.id,cls.attendCode)} label="Submit" primary small />
                    </div>
                  : <span style={{fontSize:12,color:"#d97706",fontWeight:700}}>Locked</span>}
              </div>
            ))}
        </div>
      )}
      {tab==="overview" && (
        <div style={S.listWrap}>
          {courses.map(code=>{
            const s=stats[code]; const p=pct(s.attended,s.total);
            return (
              <div key={code} style={{...S.courseCard, borderLeft:`4px solid ${pctColor(p)}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontWeight:800,fontSize:14,color:"#1e3a5f"}}>{code}</span>
                  <span style={{color:pctColor(p),fontWeight:800,fontSize:18}}>{p}%</span>
                </div>
                <div style={S.barBg}><div style={{...S.barFill,width:p+"%",background:pctColor(p)}}/></div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6}}>
                  <span style={{fontSize:12,color:"#1e40af"}}>{s.attended}/{s.total} classes attended</span>
                  <span style={{fontSize:11,fontWeight:700,padding:"2px 10px",borderRadius:99,
                    background:pctColor(p)+"22",color:pctColor(p)}}>
                    {s.total===0?"No classes yet":p>=70?"✓ Satisfactory":"⚠ Below 70%"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab==="store" && (
        <div style={S.listWrap}>
          <div style={{...S.sectionHeader,background:"linear-gradient(135deg,#dbeafe,#e0f2fe)",borderColor:"#3b82f6",marginBottom:16}}>
            <div style={{fontWeight:700,color:"#1d4ed8",fontSize:13}}>🏛 Department Store Room</div>
            <div style={{fontSize:11,color:"#1e40af",marginTop:2}}>Browse available instruments and request to borrow</div>
          </div>
          {(instruments||[]).length===0
            ? <Empty msg="No instruments in the store room yet." />
            : (instruments||[]).map(inst=>{
              const activeLoansForInst=(loans||[]).filter(l=>l.status==="active"&&l.instId===inst.id).length;
              const available=Math.max(0,inst.quantity-activeLoansForInst);
              const condColor=(c)=>c==="Good"?"#16a34a":c==="Fair"?"#d97706":"#dc2626";
              const myLoan=(loans||[]).find(l=>l.instId===inst.id&&l.borrowerId===student.studentNo&&l.status==="active");
              const myPending=(loans||[]).find(l=>l.instId===inst.id&&l.borrowerId===student.studentNo&&l.status==="pending");
              return (
                <StudentStoreCard key={inst.id} inst={inst} available={available} condColor={condColor}
                  myLoan={myLoan} myPending={myPending} student={student} saveLoan={saveLoan} showToast={showToast} />
              );
            })
          }
        </div>
      )}
      {tab==="holdings" && (
        <div style={S.listWrap}>
          <div style={{...S.sectionHeader,background:"linear-gradient(135deg,#dcfce7,#ecfdf5)",borderColor:"#22c55e",marginBottom:16}}>
            <div style={{fontWeight:700,color:"#15803d",fontSize:13}}>🎓 Instruments With Students</div>
            <div style={{fontSize:11,color:"#1e40af",marginTop:2}}>Department instruments currently assigned to students</div>
          </div>
          {(studentInstruments||[]).length===0
            ? <Empty msg="No students have declared instruments yet." />
            : (studentInstruments||[]).map(inst=>{
              const condColor=(c)=>c==="Good"?"#16a34a":c==="Fair"?"#d97706":"#dc2626";
              const isMe=inst.studentNo===student.studentNo;
              return (
                <div key={inst.id} style={{...S.classCard,borderColor:isMe?"#1d4ed8":"#bfdbfe"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:isMe?"#1d4ed8":"#1e3a5f"}}>{inst.name}</div>
                    <div style={{fontSize:12,color:"#4b6cb7"}}>{inst.type}</div>
                    <div style={{fontSize:12,color:isMe?"#1d4ed8":"#4b6cb7",marginTop:2,fontWeight:isMe?700:400}}>
                      {isMe?"👤 You":"👤 "+inst.studentName}
                    </div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,flexShrink:0,
                    background:condColor(inst.condition)+"22",color:condColor(inst.condition)}}>
                    {inst.condition}
                  </span>
                </div>
              );
            })
          }
        </div>
      )}
      {tab==="instrument" && (
        <StudentInstrumentTab
          student={student}
          studentInstruments={studentInstruments}
          saveStudentInstrument={saveStudentInstrument}
          showToast={showToast}
        />
      )}
    </div>
  );
}

// ── Student Store Card (isolated component so useState is valid) ─────────────
function StudentStoreCard({ inst, available, condColor, myLoan, myPending, student, saveLoan, showToast }) {
  const [showReq, setShowReq] = useState(false);
  const [reqNote, setReqNote] = useState("");
  return (
    <div style={S.formCard}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,color:"#1e3a5f"}}>{inst.name}</div>
          <div style={{fontSize:12,color:"#4b6cb7"}}>{inst.type}</div>
        </div>
        <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,
          background:condColor(inst.condition)+"22",color:condColor(inst.condition)}}>
          {inst.condition}
        </span>
      </div>
      <div style={{fontSize:12,color:available>0?"#16a34a":"#dc2626",marginBottom:8,fontWeight:600}}>
        {available>0?`${available} available`:"Currently unavailable"}
      </div>
      {myLoan&&<div style={{fontSize:12,color:"#d97706",marginBottom:6,fontWeight:600}}>✓ You currently have this instrument</div>}
      {myPending&&<div style={{fontSize:12,color:"#1d4ed8",marginBottom:6,fontWeight:600}}>⏳ Your request is pending approval</div>}
      {!myLoan&&!myPending&&available>0&&(
        showReq
          ? <div>
              <input style={{...S.input,marginBottom:8,fontSize:13}} placeholder="Why do you need this instrument?"
                value={reqNote} onChange={e=>setReqNote(e.target.value)} />
              <div style={{display:"flex",gap:6}}>
                <Btn onClick={()=>{
                  if(!reqNote.trim())return showToast("Please describe your purpose","error");
                  const loan={id:Date.now().toString(),instId:inst.id,borrowerName:student.name,borrowerId:student.studentNo,borrowerType:"student",purpose:reqNote.trim(),status:"pending",requestedAt:new Date().toISOString(),damageReports:[]};
                  saveLoan(loan);
                  setReqNote(""); setShowReq(false);
                  showToast("Request submitted — awaiting lecturer approval.");
                }} label="Submit Request" primary small />
                <Btn onClick={()=>setShowReq(false)} label="Cancel" small />
              </div>
            </div>
          : <Btn onClick={()=>setShowReq(true)} label="📤 Request to Borrow" small />
      )}
    </div>
  );
}

// ── Countdown Badge (Lecturer) ────────────────────────────────────────────────
function CountdownBadge({ expiresAt }) {
  const [remaining, setRemaining] = useState(Math.max(0, expiresAt - Date.now()));
  useEffect(() => {
    const iv = setInterval(() => { setRemaining(Math.max(0, expiresAt - Date.now())); }, 1000);
    return () => clearInterval(iv);
  }, [expiresAt]);
  if (remaining<=0) return <span style={{fontSize:11,background:"#fee2e2",color:"#be123c",borderRadius:6,padding:"3px 8px",fontWeight:700}}>⏰ Closed</span>;
  const mins=Math.floor(remaining/60000), secs=Math.floor((remaining%60000)/1000);
  return <span style={{fontSize:12,background:remaining<60000?"#fee2e2":"#dcfce7",color:remaining<60000?"#be123c":"#15803d",borderRadius:6,padding:"3px 8px",fontWeight:700}}>⏱ {mins}:{String(secs).padStart(2,"0")} left</span>;
}

// ── Lecturer Login ─────────────────────────────────────────────────────────────
function LecturerLogin({ lecturers, onLogin, setView }) {
  const [pin, setPin] = useState("");
  const attempt = () => {
    if (!Array.isArray(lecturers)) {
      window.alert("Still loading lecturer data — please wait a moment and try again.");
      return;
    }
    const found = lecturers.find(l => l.pin === pin.trim());
    onLogin(found || null);
    if (!found) setPin("");
  };
  return (
    <div style={S.center}>
      <div style={S.card}>
        <BackBtn onClick={() => setView("splash")} />
        <h2 style={S.cardTitle}>Lecturer Login</h2>
        <p style={S.cardSub}>Enter your PIN to access your portal.</p>
        <Field label="PIN" value={pin} onChange={setPin} placeholder="••••" type="password" />
        <Btn onClick={attempt} label="Enter Portal" primary full />
      </div>
    </div>
  );
}

// ── Lecturer Dashboard ────────────────────────────────────────────────────────
// ── Backup Reminder Banner ────────────────────────────────────────────────────
function BackupReminderBanner() {
  const lastBackupStr = localStorage.getItem("attendtrack_last_manual_backup");
  const daysSince = lastBackupStr
    ? Math.floor((Date.now() - new Date(lastBackupStr).getTime()) / (1000*60*60*24))
    : null;
  const overdue = daysSince === null || daysSince >= 7;
  if (!overdue) return null;
  return (
    <div style={{...S.formCard, borderColor:"#f59e0b", background:"#fffbeb", display:"flex", alignItems:"flex-start", gap:10}}>
      <span style={{fontSize:20}}>⏰</span>
      <div>
        <div style={{fontWeight:700, color:"#92400e", fontSize:13}}>
          {daysSince === null ? "You have not downloaded a backup yet" : `It's been ${daysSince} days since your last backup`}
        </div>
        <div style={{fontSize:12, color:"#92400e", marginTop:2}}>
          Download a fresh copy below and save it somewhere outside the app — email it to yourself or save it to Google Drive.
        </div>
      </div>
    </div>
  );
}

// ── Auto-Backup Restore (emergency fallback to last 7 daily snapshots) ───────
function AutoBackupRestore({ saveStudent, saveClass, saveRecord, savePendingForClass, saveCourses, saveLecturer, saveInstrument, saveLoan, saveStudentInstrument, showToast }) {
  const [open, setOpen] = useState(false);
  const [dates, setDates] = useState(null);
  const [loadingDates, setLoadingDates] = useState(false);

  const loadDates = async () => {
    setLoadingDates(true);
    const found = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const snapDoc = await getDoc(doc(db, "at_autobackups", dateStr));
      if (snapDoc.exists()) found.push({ date: dateStr, snap: snapDoc.data() });
    }
    setDates(found);
    setLoadingDates(false);
  };

  const restoreFrom = (snap) => {
    const d = snap.data;
    if (!d) return showToast("That snapshot looks invalid.", "error");
    if (d.students) Object.values(d.students).forEach(s=>saveStudent(s));
    if (d.classes) d.classes.forEach(c=>saveClass(c));
    if (d.records) Object.entries(d.records).forEach(([id,list])=>saveRecord(id,list));
    if (d.pending) Object.entries(d.pending).forEach(([id,list])=>savePendingForClass(id,list));
    if (d.courses) saveCourses(d.courses);
    if (d.lecturers) d.lecturers.forEach(l=>saveLecturer(l));
    if (d.instruments) d.instruments.forEach(i=>saveInstrument(i));
    if (d.loans) d.loans.forEach(l=>saveLoan(l));
    if (d.studentInstruments) d.studentInstruments.forEach(i=>saveStudentInstrument(i));
    showToast("Restored from automatic backup.");
    setOpen(false);
  };

  return (
    <div style={{marginTop:14, borderTop:"1px solid #dbeafe", paddingTop:10}}>
      <div
        onClick={() => { setOpen(!open); if (!open && !dates) loadDates(); }}
        style={{fontSize:12, color:"#1d4ed8", cursor:"pointer", fontWeight:700}}>
        {open ? "▾" : "▸"} Emergency: restore from automatic daily backup
      </div>
      {open && (
        <div style={{marginTop:8}}>
          <div style={{fontSize:11, color:"#4b6cb7", marginBottom:8}}>
            The system automatically saves a safety snapshot once a day. Use this only if you have no manual backup file and need to recover recent data.
          </div>
          {loadingDates && <div style={{fontSize:12, color:"#1e40af"}}>Checking available snapshots…</div>}
          {dates && dates.length === 0 && <div style={{fontSize:12, color:"#1e40af"}}>No automatic snapshots found yet.</div>}
          {dates && dates.map(({date, snap}) => (
            <div key={date} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:"1px solid #eef2ff"}}>
              <span style={{fontSize:12, color:"#1e3a5f"}}>{date}</span>
              <span style={{fontSize:11, color:"#1d4ed8", cursor:"pointer", fontWeight:700}}
                onClick={() => { if (window.confirm(`Restore data from ${date}? This will overwrite current data.`)) restoreFrom(snap); }}>
                Restore this
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LecturerDash({ currentLecturer, setCurrentLecturer, lecturers, saveLecturer, deleteLecturer, students, saveStudent, classes, saveClass, deleteClass, records, saveRecord, pending, savePendingForClass, courses, saveCourses, instruments, saveInstrument, deleteInstrument, loans, saveLoan, studentInstruments, saveStudentInstrument, setView, showToast, confirmedClasses, studentStats, pct, pctColor, myCoursesForLecturer }) {

  const handleLogin = (lec) => {
    if (!lec) { showToast("Incorrect PIN", "error"); return; }
    setCurrentLecturer(lec);
    showToast("Welcome, " + lec.name);
  };

  if (!currentLecturer) return <LecturerLogin lecturers={lecturers} onLogin={handleLogin} setView={setView} />;

  const myCourses = myCoursesForLecturer(currentLecturer);
  const isAdmin   = currentLecturer.isAdmin || currentLecturer.courses === "__all__";

  const [tab, setTab]           = useState("pending");
  const [newClass, setNewClass] = useState({ courseCode:"", date:"", topic:"" });
  const [newCourse, setNewCourse]       = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [nlName, setNlName]       = useState("");
  const [nlPin, setNlPin]         = useState("");
  const [nlCourses, setNlCourses] = useState([]);
  const [nlInCharge, setNlInCharge] = useState(false);
  const [curPin, setCurPin]     = useState("");
  const [newPin, setNewPin]     = useState("");
  const [confPin, setConfPin]   = useState("");
  const [resetTarget, setResetTarget] = useState(null);
  const [resetNewPin, setResetNewPin] = useState("");
  const [signDuration, setSignDuration] = useState(15);
  const [manualClassId, setManualClassId] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [coursesToStart, setCoursesToStart] = useState([]);
  const [showCourseSheet, setShowCourseSheet] = useState(false);
  const [newCourseCode, setNewCourseCode] = useState("");

  const toggleCourseToStart = (code) => setCoursesToStart(prev =>
    prev.includes(code) ? prev.filter(c=>c!==code) : [...prev, code]
  );

  // Registers a never-before-taught course (adds it to the lecturer's assigned
  // list and the department's master list, same as the Classes tab does) and
  // immediately selects it to start — so a lecturer teaching a new course for
  // the first time doesn't have to leave the Today Banner to do it in two steps.
  const addAndSelectNewCourse = () => {
    const code = newCourseCode.trim().toUpperCase();
    if (!code) return showToast("Type a course code first", "error");
    saveCourses((courses||[]).includes(code) ? (courses||[]) : [...(courses||[]), code]);
    if (!isAdmin) {
      const myAssigned = Array.isArray(currentLecturer.courses) ? currentLecturer.courses : [];
      if (!myAssigned.includes(code)) {
        const updated = { ...currentLecturer, courses: [...myAssigned, code] };
        saveLecturer(updated);
        setCurrentLecturer(updated);
      }
    }
    setCoursesToStart(prev => prev.includes(code) ? prev : [...prev, code]);
    setNewCourseCode("");
    showToast(`${code} added — select Start Selected to open it.`);
  };

  const addCls = () => {
    const code = newClass.courseCode.trim().toUpperCase();
    if (!newClass.date || !code) return showToast("Fill course code and date", "error");
    saveCourses((courses||[]).includes(code) ? courses : [...(courses||[]), code]);
    if (!isAdmin) {
      const myAssigned = Array.isArray(currentLecturer.courses) ? currentLecturer.courses : [];
      if (!myAssigned.includes(code)) {
        const updated = { ...currentLecturer, courses: [...myAssigned, code] };
        saveLecturer(updated);
        setCurrentLecturer(updated);
      }
    }
    const cls = { id: Date.now().toString(), courseCode: code, date: newClass.date, topic: newClass.topic, confirmed: false, lecturerId: currentLecturer.id };
    saveClass(cls);
    showToast("Class session created. Confirm it to open for students.");
    setNewClass({ courseCode:"", date:"", topic:"" });
  };

  const confirmClass = (id) => {
    const code = genCode();
    const cls = (classes||[]).find(c=>c.id===id);
    if (cls) saveClass({ ...cls, confirmed:true, attendCode:code, expiresAt: Date.now()+signDuration*60*1000 });
    showToast("Class confirmed! Code: " + code + " (" + signDuration + " min)");
  };

  const handleDeleteClass = (id) => {
    deleteClass(id);
    showToast("Class session removed.");
  };

  const toggleManualAttendance = (classId, studentNo) => {
    const list = records[classId] || [];
    const updated = list.includes(studentNo) ? list.filter(s=>s!==studentNo) : [...list, studentNo];
    saveRecord(classId, updated);
  };

  const saveManualAttendance = (classId) => {
    savePendingForClass(classId, []);
    setManualClassId(null);
    showToast("Attendance saved successfully!");
  };

  const approveStudent = (classId, studentNo) => {
    saveRecord(classId, [...(records[classId]||[]), studentNo]);
    savePendingForClass(classId, (pending[classId]||[]).filter(s=>s!==studentNo));
    showToast("Attendance recorded.");
  };

  const rejectStudent = (classId, studentNo) => {
    savePendingForClass(classId, (pending[classId]||[]).filter(s=>s!==studentNo));
    showToast("Attendance request rejected.");
  };

  const startTodaysClasses = () => {
    if (myCourses.length===0 && !newCourseCode.trim()) return showToast("No courses yet. Add a course code below.", "error");
    // Single course — no need to show a picker, just start it directly
    if (myCourses.length===1) return confirmStart(myCourses);
    // Multiple courses — open the selection sheet
    setShowCourseSheet(true);
  };

  const confirmStart = (targets) => {
    if (!targets||targets.length===0) return showToast("Select at least one course to start.", "error");
    const targetDate = selectedDate;
    const alreadyStarted = targets.filter(code => (classes||[]).some(c=>c.courseCode===code&&c.date===targetDate&&c.confirmed));
    if (alreadyStarted.length===targets.length) return showToast("Selected course(s) for this date are already open.", "error");
    const isPast = targetDate < today;
    const newSessions = [];
    targets.forEach(code => {
      const exists = (classes||[]).some(c=>c.courseCode===code&&c.date===targetDate);
      if (!exists) {
        const sess = { id: Date.now().toString()+code, courseCode:code, date:targetDate, topic:"", confirmed:true, lecturerId:currentLecturer.id, attendCode:genCode() };
        if (!isPast) sess.expiresAt = Date.now()+signDuration*60*1000;
        newSessions.push(sess);
      } else {
        const existing = (classes||[]).find(c=>c.courseCode===code&&c.date===targetDate);
        if (existing) saveClass({ ...existing, confirmed:true, attendCode:existing.attendCode||genCode(), ...(!isPast&&!existing.expiresAt?{expiresAt:Date.now()+signDuration*60*1000}:{}) });
      }
    });
    newSessions.forEach(s => saveClass(s));
    setCoursesToStart([]);
    setShowCourseSheet(false);
    showToast(isPast ? "Past session(s) created — mark attendance manually." : "Class(es) open — students can sign in!");
  };

  const changeMyPin = () => {
    if (curPin!==currentLecturer.pin) return showToast("Current PIN is incorrect","error");
    if (!newPin.trim()) return showToast("New PIN cannot be empty","error");
    if (newPin!==confPin) return showToast("New PINs do not match","error");
    if (newPin===curPin) return showToast("New PIN must differ from current","error");
    if (lecturers.find(l=>l.id!==currentLecturer.id&&l.pin===newPin)) return showToast("That PIN is already in use","error");
    const updated={...currentLecturer,pin:newPin};
    saveLecturer(updated);
    setCurrentLecturer(updated);
    setCurPin(""); setNewPin(""); setConfPin("");
    showToast("PIN changed successfully!");
  };

  const adminResetPin = () => {
    if (!resetNewPin.trim()) return showToast("New PIN cannot be empty","error");
    if (lecturers.find(l=>l.id!==resetTarget&&l.pin===resetNewPin)) return showToast("That PIN is already in use","error");
    const target=(lecturers||[]).find(l=>l.id===resetTarget); if(target) saveLecturer({...target,pin:resetNewPin});
    setResetTarget(null); setResetNewPin("");
    showToast("PIN reset successfully.");
  };

  const addLecturer = () => {
    if (!nlName.trim()||!nlPin.trim()) return showToast("Name and PIN are required","error");
    if (lecturers.find(l=>l.pin===nlPin.trim())) return showToast("That PIN is already in use","error");
    const lec={id:Date.now().toString(),name:nlName.trim(),pin:nlPin.trim(),courses:nlCourses,isAdmin:false,instrumentInCharge:nlInCharge};
    saveLecturer(lec);
    setNlName(""); setNlPin(""); setNlCourses([]); setNlInCharge(false);
    showToast("Lecturer added successfully.");
  };

  const removeLecturer = (id) => {
    if (id==="admin") return showToast("Cannot remove the admin account","error");
    deleteLecturer(id);
    showToast("Lecturer removed.");
  };

  const toggleNlCourse = (code) => setNlCourses(prev=>prev.includes(code)?prev.filter(c=>c!==code):[...prev,code]);

  const allPending = [];
  Object.entries(pending||{}).forEach(([classId,sns])=>{
    const cls=classes.find(c=>c.id===classId);
    if (!cls||!myCourses.includes(cls.courseCode)) return;
    sns.forEach(sno=>{ const st=students[sno]; if(st) allPending.push({classId,cls,student:st}); });
  });

  const myClasses   = (classes||[]).filter(c=>(myCourses||[]).includes(c.courseCode));
  const myConfirmed = (confirmedClasses||[]).filter(c=>(myCourses||[]).includes(c.courseCode));

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerInner}>
          <div>
            <div style={S.headerTitle}>AttendTrack</div>
            <div style={S.headerSub}>NOCEN Music Dept · {currentLecturer.name}{isAdmin?" · Admin":""}</div>
          </div>
          <Btn onClick={()=>{setCurrentLecturer(null);setView("splash");}} label="Sign Out" small />
        </div>
      </div>

      <div style={S.chips}>
        <Chip label="Students" value={Object.keys(students||{}).length} color="#1d4ed8" />
        <Chip label="My Classes" value={myConfirmed.length} color="#16a34a" />
        <Chip label="Pending" value={allPending.length} color="#d97706" />
      </div>

      <div style={{...S.todayBanner, flexDirection:"column", alignItems:"stretch", gap:10}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,color:"#1e3a5f"}}>📅 {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
          <div style={{fontSize:12,color:"#1d4ed8",marginTop:2,fontWeight:600}}>
            {(myCourses||[]).filter(code=>(classes||[]).some(c=>c.courseCode===code&&c.date===today&&c.confirmed)).length} / {(myCourses||[]).length} courses open today
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:8}}>
            {(classes||[]).filter(c=>(myCourses||[]).includes(c.courseCode)&&c.date===today&&c.confirmed&&c.attendCode).map(c=>(
              <div key={c.id} style={{display:"inline-flex",alignItems:"center",gap:8,background:"#eff6ff",border:"1.5px solid #1d4ed8",borderRadius:8,padding:"4px 14px"}}>
                <span style={{fontSize:11,color:"#4b6cb7"}}>{c.courseCode}:</span>
                <span style={{fontSize:22,fontWeight:800,letterSpacing:5,color:"#1d4ed8"}}>{c.attendCode}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,flex:1}}>
            <span style={{fontSize:11,color:"#1e40af",fontWeight:600,whiteSpace:"nowrap"}}>Date:</span>
            <input type="date" style={{...S.select,padding:"6px 8px",fontSize:12,flex:1,minWidth:0}} value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} />
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:"#1e40af",fontWeight:600,whiteSpace:"nowrap"}}>Window:</span>
            <select style={{...S.select,padding:"6px 8px",fontSize:12}} value={signDuration} onChange={e=>setSignDuration(Number(e.target.value))}>
              {[5,10,15,20,30].map(m=><option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>
        <Btn onClick={startTodaysClasses}
          label={selectedDate<today?"▶ Create Past Session":"▶ Start Class"}
          primary full />
      </div>

      {/* Course selection bottom sheet */}
      {showCourseSheet&&(
        <div style={S.overlay} onClick={()=>setShowCourseSheet(false)}>
          <div onClick={e=>e.stopPropagation()} style={{
            position:"fixed",bottom:0,left:0,right:0,
            background:"#fff",borderRadius:"20px 20px 0 0",
            padding:24,maxHeight:"80vh",overflowY:"auto",
            boxShadow:"0 -8px 32px rgba(0,0,0,0.18)",zIndex:200
          }}>
            <div style={{fontWeight:800,fontSize:16,color:"#1e3a5f",marginBottom:4}}>Select Course(s) to Start</div>
            <div style={{fontSize:12,color:"#4b6cb7",marginBottom:16}}>
              {selectedDate} · {signDuration} min window
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <Btn onClick={()=>{
                const openable=myCourses.filter(code=>!(classes||[]).some(c=>c.courseCode===code&&c.date===selectedDate&&c.confirmed));
                setCoursesToStart(openable);
              }} label="Select All" small />
              <Btn onClick={()=>setCoursesToStart([])} label="Clear" small />
            </div>
            {myCourses.map(code=>{
              const alreadyOpen=(classes||[]).some(c=>c.courseCode===code&&c.date===selectedDate&&c.confirmed);
              const selected=coursesToStart.includes(code);
              return (
                <div key={code} onClick={()=>!alreadyOpen&&toggleCourseToStart(code)}
                  style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",
                    marginBottom:8,borderRadius:12,cursor:alreadyOpen?"default":"pointer",
                    background:selected?"#eff6ff":alreadyOpen?"#f8fafc":"#ffffff",
                    border:`1.5px solid ${selected?"#1d4ed8":alreadyOpen?"#e2e8f0":"#dbeafe"}`}}>
                  <div style={{width:22,height:22,borderRadius:6,flexShrink:0,
                    border:`2px solid ${selected?"#1d4ed8":alreadyOpen?"#cbd5e1":"#93c5fd"}`,
                    background:selected?"#1d4ed8":"transparent",
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {selected&&<span style={{color:"#fff",fontSize:13,fontWeight:800}}>✓</span>}
                    {alreadyOpen&&!selected&&<span style={{color:"#94a3b8",fontSize:13}}>✓</span>}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14,color:alreadyOpen?"#94a3b8":"#1e3a5f"}}>{code}</div>
                    {alreadyOpen&&<div style={{fontSize:11,color:"#94a3b8"}}>Already open today</div>}
                  </div>
                </div>
              );
            })}
            <div style={{marginTop:8,paddingTop:12,borderTop:"1px solid #dbeafe"}}>
              <div style={{fontSize:12,color:"#4b6cb7",marginBottom:8,fontWeight:600}}>Teaching a new course today?</div>
              <div style={{display:"flex",gap:6}}>
                <input placeholder="Type course code e.g. MUS 427"
                  value={newCourseCode}
                  onChange={e=>setNewCourseCode(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&addAndSelectNewCourse()}
                  style={{...S.input,flex:1,padding:"8px 12px",fontSize:13}} />
                <Btn onClick={addAndSelectNewCourse} label="＋ Add" small />
              </div>
            </div>
            <div style={{marginTop:16,display:"flex",gap:8}}>
              <Btn onClick={()=>confirmStart(coursesToStart)} label={selectedDate<today?"▶ Create Past Session":"▶ Open Selected Classes"} primary full />
              <Btn onClick={()=>setShowCourseSheet(false)} label="Cancel" small />
            </div>
          </div>
        </div>
      )}

      <div style={{...S.tabs,flexWrap:"wrap"}}>
        {[["pending","⏳ Pending"],["classes","📅 Classes"],["students","👥 Students"],
          ...(isAdmin?[["lecturers","👨‍🏫 Lecturers"],["manage","⚙️ Manage"]]:[["manage","⚙️ Manage"]])
        ].map(([t,l])=>(
          <div key={t} style={{...S.tab,...(tab===t?S.tabActive:{})}} onClick={()=>setTab(t)}>
            {l}{t==="pending"&&allPending.length>0&&<span style={S.badge2}>{allPending.length}</span>}
          </div>
        ))}
      </div>

      {tab==="pending" && (
        <div style={S.listWrap}>
          {allPending.length===0?<Empty msg="No pending attendance requests."/>:
            allPending.map(({classId,cls,student})=>(
              <div key={classId+student.studentNo} style={S.classCard}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:"#1e3a5f"}}>{student.name}</div>
                  <div style={{fontSize:12,color:"#4b6cb7"}}>{student.studentNo}</div>
                  <div style={{fontSize:13,marginTop:4,color:"#1e40af"}}>{cls.courseCode} · {cls.date}{cls.topic?" · "+cls.topic:""}</div>
                </div>
                <div style={{display:"flex",gap:6}}>
                  <Btn onClick={()=>approveStudent(classId,student.studentNo)} label="✓ Confirm" primary small />
                  <Btn onClick={()=>rejectStudent(classId,student.studentNo)} label="✗ Reject" small danger />
                </div>
              </div>
            ))}
        </div>
      )}

      {tab==="classes" && (
        <div style={S.listWrap}>
          <div style={S.formCard}>
            <div style={{fontWeight:700,marginBottom:12,color:"#1e3a5f"}}>Add New Class Session</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <input style={{...S.input,flex:1,minWidth:120}} placeholder="Course code e.g. MUS 427" value={newClass.courseCode} onChange={e=>setNewClass(p=>({...p,courseCode:e.target.value}))} />
              <input type="date" style={S.input} value={newClass.date} onChange={e=>setNewClass(p=>({...p,date:e.target.value}))} />
              <input style={{...S.input,flex:2}} placeholder="Topic (optional)" value={newClass.topic} onChange={e=>setNewClass(p=>({...p,topic:e.target.value}))} />
            </div>
            <Btn onClick={addCls} label="Add Session" primary full style={{marginTop:10}} />
          </div>
          {[...myClasses].reverse().map(cls=>(
            <div key={cls.id}>
            <div style={S.classCard}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,color:"#1e3a5f"}}>{cls.courseCode}</div>
                <div style={{fontSize:13,color:"#4b6cb7"}}>{cls.topic||"Class"} · {cls.date}</div>
                <div style={{fontSize:12,marginTop:4}}>
                  {cls.confirmed?<span style={{color:"#16a34a",fontWeight:600}}>✓ Confirmed · {(records[cls.id]||[]).length} signed</span>:<span style={{color:"#d97706",fontWeight:600}}>⏳ Not confirmed yet</span>}
                </div>
                {cls.confirmed&&cls.attendCode&&(
                  <div style={{marginTop:6,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"#eff6ff",border:"1.5px solid #1d4ed8",borderRadius:8,padding:"4px 12px"}}>
                      <span style={{fontSize:11,color:"#4b6cb7"}}>Code:</span>
                      <span style={{fontSize:20,fontWeight:800,letterSpacing:4,color:"#1d4ed8"}}>{cls.attendCode}</span>
                    </div>
                    {cls.expiresAt&&<CountdownBadge expiresAt={cls.expiresAt}/>}
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                {!cls.confirmed&&<Btn onClick={()=>confirmClass(cls.id)} label="Confirm" primary small />}
                {cls.confirmed&&<Btn onClick={()=>setManualClassId(manualClassId===cls.id?null:cls.id)} label="✏ Mark" small />}
                <Btn onClick={()=>handleDeleteClass(cls.id)} label="🗑" small danger />
              </div>
            </div>
            {manualClassId===cls.id && (
              <div style={{...S.formCard,marginTop:-6,borderTop:"none",borderRadius:"0 0 14px 14px",paddingTop:12}}>
                <div style={{fontWeight:700,color:"#1e3a5f",marginBottom:4,fontSize:13}}>✏ Mark Attendance — {cls.courseCode} · {cls.date}</div>
                <div style={{fontSize:12,color:"#1e40af",marginBottom:10}}>Tap a student to toggle Present/Absent. Tap Save when done.</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                  {Object.values(students||{}).map(s => {
                    const present = (records[cls.id]||[]).includes(s.studentNo);
                    return (
                      <div key={s.studentNo} onClick={()=>toggleManualAttendance(cls.id,s.studentNo)}
                        style={{padding:"6px 12px",borderRadius:99,fontSize:12,cursor:"pointer",fontWeight:600,
                          background:present?"#dcfce7":"#f1f5f9",
                          color:present?"#15803d":"#64748b",
                          border:`1.5px solid ${present?"#22c55e":"#e2e8f0"}`}}>
                        {present?"✓ ":""}{s.name}
                      </div>
                    );
                  })}
                </div>
                {Object.keys(students||{}).length===0&&<div style={{fontSize:12,color:"#1e40af",marginBottom:10}}>No students registered yet.</div>}
                <div style={{fontSize:12,color:"#4b6cb7",marginBottom:10}}>
                  {(records[cls.id]||[]).length} of {Object.keys(students||{}).length} students marked present
                </div>
                <div style={{display:"flex",gap:8}}>
                  <Btn onClick={()=>saveManualAttendance(cls.id)} label="💾 Save Attendance" primary small />
                  <Btn onClick={()=>setManualClassId(null)} label="Cancel" small />
                </div>
              </div>
            )}
            </div>
          ))}
        </div>
      )}

      {tab==="students" && (
        <div style={S.listWrap}>
          {Object.values(students||{}).length===0 ? <Empty msg="No students registered yet." /> : <>

            <div style={{...S.sectionHeader,background:"linear-gradient(135deg,#dbeafe,#e0f2fe)",borderColor:"#3b82f6",marginBottom:10}}>
              <div style={{fontWeight:800,color:"#1d4ed8",fontSize:13}}>🎵 Music Department Students</div>
              <div style={{fontSize:11,color:"#1e40af",marginTop:2}}>{Object.values(students||{}).filter(s=>!s.department||s.department==="music").length} students</div>
            </div>
            {Object.values(students||{}).filter(s=>!s.department||s.department==="music").map(s=>{
              const stats=studentStats(s.studentNo,myCourses);
              let tot=0,att=0; Object.values(stats).forEach(x=>{tot+=x.total;att+=x.attended;});
              const p=pct(att,tot);
              return (
                <div key={s.studentNo} style={{...S.classCard,marginBottom:8,cursor:"pointer"}} onClick={()=>setSelectedStudent(s)}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,color:"#1e3a5f"}}>{s.name}</div>
                    <div style={{fontSize:12,color:"#1e40af"}}>{s.studentNo}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{color:pctColor(p),fontWeight:800,fontSize:17}}>{p}%</div>
                  </div>
                </div>
              );
            })}

            <div style={{...S.sectionHeader,background:"linear-gradient(135deg,#e0f2fe,#ecfdf5)",borderColor:"#0891b2",marginTop:16,marginBottom:10}}>
              <div style={{fontWeight:800,color:"#0369a1",fontSize:13}}>📚 Borrowed Course Students</div>
              <div style={{fontSize:11,color:"#0369a1",marginTop:2,opacity:0.8}}>{Object.values(students||{}).filter(s=>s.department==="borrowed").length} students · other departments</div>
            </div>
            {Object.values(students||{}).filter(s=>s.department==="borrowed").length===0
              ? <div style={{textAlign:"center",color:"#4b6cb7",padding:"10px 0",fontSize:13}}>No borrowed course students yet.</div>
              : Object.values(students||{}).filter(s=>s.department==="borrowed").map(s=>{
                const stats=studentStats(s.studentNo,myCourses);
                let tot=0,att=0; Object.values(stats).forEach(x=>{tot+=x.total;att+=x.attended;});
                const p=pct(att,tot);
                return (
                  <div key={s.studentNo} style={{...S.classCard,borderColor:"#7dd3fc",marginBottom:8,cursor:"pointer"}} onClick={()=>setSelectedStudent(s)}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,color:"#0369a1"}}>{s.name}</div>
                      <div style={{fontSize:12,color:"#0891b2"}}>{s.studentNo}</div>
                      <span style={{fontSize:10,background:"#e0f2fe",color:"#0369a1",borderRadius:99,padding:"2px 7px",fontWeight:700,display:"inline-block",marginTop:2}}>Borrowed</span>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{color:pctColor(p),fontWeight:800,fontSize:17}}>{p}%</div>
                    </div>
                  </div>
                );
              })
            }
          </>}
          {selectedStudent&&<StudentModal student={selectedStudent} studentStats={studentStats} courses={myCourses} pct={pct} pctColor={pctColor} onClose={()=>setSelectedStudent(null)} onMoveDept={(s)=>{saveStudent({...s,department:s.department==="borrowed"?"music":"borrowed"});showToast(s.name+" moved successfully.");}}/>}
        </div>
      )}

      {tab==="lecturers"&&isAdmin&&(
        <div style={S.listWrap}>
          <div style={S.formCard}>
            <div style={{fontWeight:700,marginBottom:12,color:"#1e3a5f"}}>Add New Lecturer</div>
            <Field label="Full Name" value={nlName} onChange={setNlName} placeholder="e.g. Dr. Adaeze Eze" />
            <Field label="PIN" value={nlPin} onChange={setNlPin} placeholder="e.g. 5678" type="password" />
            <div style={{marginBottom:16}}>
              <label style={S.label}>Assign Courses (optional)</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:6}}>
                {(courses||[]).map(code=>(
                  <div key={code} onClick={()=>toggleNlCourse(code)} style={{...S.courseChip,...(nlCourses.includes(code)?S.courseChipActive:{})}}>
                    {code}
                  </div>
                ))}
              </div>
              {(courses||[]).length===0&&<div style={{fontSize:12,color:"#1e40af"}}>No courses registered yet.</div>}
            </div>
            <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
              <input type="checkbox" id="nlInCharge" checked={nlInCharge||false} onChange={e=>setNlInCharge(e.target.checked)}
                style={{width:16,height:16,accentColor:"#1d4ed8",cursor:"pointer"}} />
              <label htmlFor="nlInCharge" style={{...S.label,marginBottom:0,cursor:"pointer",color:"#1e3a5f",textTransform:"none"}}>
                Instrument Store — Lecturer in Charge
              </label>
            </div>
            <Btn onClick={addLecturer} label="Add Lecturer" primary full />
          </div>
          {(lecturers||[]).map(lec=>(
            <div key={lec.id}>
              <div style={S.classCard}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:"#1e3a5f"}}>{lec.name}</div>
                  <div style={{fontSize:12,color:"#4b6cb7",marginTop:3}}>
                    {lec.isAdmin?"Admin — all courses":(Array.isArray(lec.courses)?lec.courses.join(", "):"All courses")}
                  </div>
                  {lec.instrumentInCharge&&<span style={{fontSize:10,background:"#dcfce7",color:"#15803d",borderRadius:99,padding:"2px 8px",marginTop:4,display:"inline-block",fontWeight:700}}>🎸 Instrument In Charge</span>}
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                  {!lec.isAdmin&&<>
                    <Btn onClick={()=>{
                      saveLecturer({...lec,instrumentInCharge:!lec.instrumentInCharge});
                      showToast(lec.instrumentInCharge?"Instrument In Charge role removed.":"Instrument In Charge role assigned.");
                    }} label={lec.instrumentInCharge?"🎸 In Charge":"🎸 Set In Charge"} small />
                    <Btn onClick={()=>{setResetTarget(lec.id===resetTarget?null:lec.id);setResetNewPin("");}} label="Reset PIN" small />
                    <Btn onClick={()=>removeLecturer(lec.id)} label="Remove" small danger />
                  </>}
                  {lec.isAdmin&&<span style={{fontSize:11,color:"#1d4ed8",fontWeight:700}}>ADMIN</span>}
                </div>
              </div>
              {resetTarget===lec.id&&(
                <div style={{...S.formCard,marginTop:-6,borderTop:"none",borderRadius:"0 0 14px 14px",paddingTop:12}}>
                  <div style={{fontSize:12,color:"#4b6cb7",marginBottom:10}}>Set new PIN for <strong style={{color:"#1e3a5f"}}>{lec.name}</strong></div>
                  <div style={{display:"flex",gap:8}}>
                    <input type="password" style={{...S.input,flex:1}} placeholder="New PIN" value={resetNewPin} onChange={e=>setResetNewPin(e.target.value)} />
                    <Btn onClick={adminResetPin} label="Save" primary small />
                    <Btn onClick={()=>{setResetTarget(null);setResetNewPin("");}} label="Cancel" small />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==="manage"&&(
        <div style={S.listWrap}>
          {(courses===null||lecturers===null)?<Empty msg="Loading data, please wait..."/>:<>

          <div style={S.formCard}>
            <div style={{fontWeight:700,marginBottom:4,color:"#1e3a5f"}}>🔑 Change My PIN</div>
            <div style={{fontSize:12,color:"#1e40af",marginBottom:14}}>Update your login PIN securely.</div>
            <Field label="Current PIN" value={curPin} onChange={setCurPin} placeholder="Current PIN" type="password" />
            <Field label="New PIN" value={newPin} onChange={setNewPin} placeholder="New PIN" type="password" />
            <Field label="Confirm New PIN" value={confPin} onChange={setConfPin} placeholder="Re-enter new PIN" type="password" />
            <Btn onClick={changeMyPin} label="Update PIN" primary full />
          </div>

          <div style={S.formCard}>
            <div style={{fontWeight:700,marginBottom:4,color:"#1e3a5f"}}>📥 Export Attendance</div>
            <div style={{fontSize:12,color:"#1e40af",marginBottom:14}}>Download records as CSV — opens in Excel.</div>
            <Btn onClick={()=>exportFullRegister({students:students||{},classes:myClasses||[],records:records||{},courses:myCourses||[],confirmedClasses:myConfirmed||[],pct,showToast})} label="Full Register (My Courses)" primary full />
            <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:8}}>
              {(myCourses||[]).map(code=>(
                <Btn key={code} onClick={()=>exportCourseCSV({code,students:students||{},classes:classes||[],records:records||{},confirmedClasses:myConfirmed||[],pct,showToast})} label={code} small />
              ))}
            </div>
          </div>

          {isAdmin&&<BackupReminderBanner />}

          {isAdmin&&(
            <div style={S.formCard}>
              <div style={{fontWeight:700,marginBottom:4,color:"#1e3a5f"}}>💾 Backup & Restore Data</div>
              <div style={{fontSize:12,color:"#1e40af",marginBottom:12}}>Download a full backup weekly. Restore if data is ever lost.</div>
              <Btn onClick={()=>{
                try {
                  const backup = { version:"1.1", exportedAt:new Date().toISOString(), school:"Nwafor Orizu College of Education", department:"Music", data:{ students:students||{}, classes:classes||[], records:records||{}, pending:pending||{}, courses:courses||[], lecturers:lecturers||[], instruments:instruments||[], loans:loans||[], studentInstruments:studentInstruments||[] }};
                  const blob = new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement("a");
                  a.href=url; a.download=`AttendTrack_Backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
                  URL.revokeObjectURL(url);
                  localStorage.setItem("attendtrack_last_manual_backup", new Date().toISOString());
                  showToast("Backup downloaded!");
                } catch(e){ showToast("Backup failed: "+e.message,"error"); }
              }} label="⬇ Download Full Backup" primary full />
              <div style={{marginTop:10}}>
                <div style={{fontSize:12,color:"#1e40af",marginBottom:6}}>Restore from backup file:</div>
                <label style={{display:"block",border:"2px dashed #93c5fd",borderRadius:10,padding:"12px",textAlign:"center",cursor:"pointer",fontSize:12,color:"#1e40af",background:"#f0f7ff"}}>
                  📂 Tap to select backup file (.json)
                  <input type="file" accept=".json" style={{display:"none"}} onChange={e=>{
                    const file = e.target.files[0];
                    if(!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      try {
                        const backup = JSON.parse(ev.target.result);
                        if(!backup.data) return showToast("Invalid backup file","error");
                        const d = backup.data;
                        if(d.students) Object.values(d.students).forEach(s=>saveStudent(s));
                        if(d.classes) d.classes.forEach(c=>saveClass(c));
                        if(d.records) Object.entries(d.records).forEach(([id,list])=>saveRecord(id,list));
                        if(d.pending) Object.entries(d.pending).forEach(([id,list])=>savePendingForClass(id,list));
                        if(d.courses) saveCourses(d.courses);
                        if(d.lecturers) d.lecturers.forEach(l=>saveLecturer(l));
                        if(d.instruments && d.instruments.forEach) d.instruments.forEach(i=>saveInstrument(i));
                        if(d.loans && d.loans.forEach) d.loans.forEach(l=>saveLoan(l));
                        if(d.studentInstruments && d.studentInstruments.forEach) d.studentInstruments.forEach(i=>saveStudentInstrument(i));
                        showToast("Data restored from backup!");
                      } catch { showToast("Could not read backup file","error"); }
                    };
                    reader.readAsText(file);
                  }} />
                </label>
              </div>
              <AutoBackupRestore
                saveStudent={saveStudent} saveClass={saveClass} saveRecord={saveRecord}
                savePendingForClass={savePendingForClass} saveCourses={saveCourses} saveLecturer={saveLecturer}
                saveInstrument={saveInstrument} saveLoan={saveLoan} saveStudentInstrument={saveStudentInstrument}
                showToast={showToast} />
            </div>
          )}

          {isAdmin&&(
            <div style={S.formCard}>
              <div style={{fontWeight:700,marginBottom:12,color:"#1e3a5f"}}>Course Management</div>
              <div style={{display:"flex",gap:8}}>
                <input style={{...S.input,flex:1}} placeholder="New course code e.g. MUS 310" value={newCourse} onChange={e=>setNewCourse(e.target.value)} />
                <Btn onClick={()=>{
                  if(!newCourse.trim()) return;
                  const list = courses||[];
                  if(list.includes(newCourse.trim())) return showToast("Course already exists","error");
                  saveCourses([...list, newCourse.trim()]); setNewCourse(""); showToast("Course added.");
                }} label="Add" primary small />
              </div>
              <div style={{marginTop:16}}>
                {(courses||[]).map(c=>(
                  <div key={c} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #dbeafe"}}>
                    <span style={{color:"#1e3a5f"}}>{c}</span>
                    <span style={{fontSize:12,color:"#dc2626",cursor:"pointer",fontWeight:600}} onClick={()=>saveCourses((courses||[]).filter(x=>x!==c))}>Remove</span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </>}
        </div>
      )}
    </div>
  );
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function downloadCSV(filename,rows){
  const csv=rows.map(r=>r.map(cell=>`"${String(cell).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}
function exportFullRegister({students,classes,records,courses,confirmedClasses,pct,showToast}){
  const list=Object.values(students); if(!list.length)return showToast("No students yet.","error");
  const header=["Student Name","Student Number","Department"]; courses.forEach(code=>header.push(code+" Attended",code+" Total",code+" %")); header.push("Overall Attended","Overall Total","Overall %","Status");
  const rows=[header];
  const sorted=[...list.filter(s=>!s.department||s.department==="music"),...list.filter(s=>s.department==="borrowed")];
  sorted.forEach(s=>{
    const deptLabel=(!s.department||s.department==="music")?"Music Department":"Borrowed Course";
    const row=[s.name,s.studentNo,deptLabel]; let ta=0,tc=0;
    courses.forEach(code=>{ const cls=confirmedClasses.filter(c=>c.courseCode===code); const att=cls.filter(c=>(records[c.id]||[]).includes(s.studentNo)).length; ta+=att;tc+=cls.length; row.push(att,cls.length,pct(att,cls.length)+"%"); });
    const op=pct(ta,tc); row.push(ta,tc,op+"%",op>=70?"Satisfactory":"Below 70%"); rows.push(row);
  });
  downloadCSV(`AttendTrack_FullRegister_${new Date().toISOString().slice(0,10)}.csv`,rows);
  showToast("Full register exported!");
}
function exportCourseCSV({code,students,classes,records,confirmedClasses,pct,showToast}){
  const list=Object.values(students); if(!list.length)return showToast("No students yet.","error");
  const cls=confirmedClasses.filter(c=>c.courseCode===code).sort((a,b)=>a.date.localeCompare(b.date));
  if(!cls.length)return showToast("No confirmed classes for "+code+" yet.","error");
  const header=["Student Name","Student Number",...cls.map(c=>c.date+(c.topic?" ("+c.topic+")":" ")),"Total Attended","Total Classes","Attendance %","Status"];
  const rows=[header];
  list.forEach(s=>{ const row=[s.name,s.studentNo]; let att=0; cls.forEach(c=>{ const p=(records[c.id]||[]).includes(s.studentNo); row.push(p?"P":"A"); if(p)att++; }); const p=pct(att,cls.length); row.push(att,cls.length,p+"%",p>=70?"Satisfactory":"Below 70%"); rows.push(row); });
  downloadCSV(`AttendTrack_${code.replace(" ","")}_${new Date().toISOString().slice(0,10)}.csv`,rows);
  showToast(code+" register exported!");
}

// ── Student Modal ─────────────────────────────────────────────────────────────
function StudentModal({ student, studentStats, courses, pct, pctColor, onClose, onMoveDept }) {
  const stats=studentStats(student.studentNo,courses);
  const isBorrowed = student.department==="borrowed";
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div>
            <div style={{fontWeight:800,fontSize:17,color:"#1e3a5f"}}>{student.name}</div>
            <div style={{fontSize:13,color:"#1e40af"}}>{student.studentNo}</div>
            <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:99,display:"inline-block",marginTop:5,
              background:isBorrowed?"#e0f2fe":"#dbeafe",color:isBorrowed?"#0369a1":"#1d4ed8"}}>
              {isBorrowed?"📚 Borrowed Course":"🎵 Music Department"}
            </span>
          </div>
          <span style={{cursor:"pointer",fontSize:20,color:"#94a3b8"}} onClick={onClose}>✕</span>
        </div>
        {onMoveDept&&(
          <div onClick={()=>{onMoveDept(student);onClose();}}
            style={{marginBottom:16,padding:"10px 14px",borderRadius:10,cursor:"pointer",textAlign:"center",fontSize:13,fontWeight:700,
              background:isBorrowed?"#dbeafe":"#e0f2fe",color:isBorrowed?"#1d4ed8":"#0369a1",
              border:isBorrowed?"2px solid #1d4ed8":"2px solid #0891b2"}}>
            {isBorrowed?"🎵 Move to Music Department":"📚 Move to Borrowed Course"}
          </div>
        )}
        {courses.map(code=>{ const s=stats[code]; const p=pct(s.attended,s.total); return (
          <div key={code} style={{marginBottom:14,borderLeft:`3px solid ${pctColor(p)}`,paddingLeft:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:13,fontWeight:700,color:"#1e3a5f"}}>{code}</span>
              <span style={{color:pctColor(p),fontWeight:800,fontSize:16}}>{p}%</span>
            </div>
            <div style={S.barBg}><div style={{...S.barFill,width:p+"%",background:pctColor(p)}}/></div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
              <span style={{fontSize:11,color:"#1e40af"}}>{s.attended}/{s.total} classes</span>
              <span style={{fontSize:10,fontWeight:700,color:pctColor(p)}}>{s.total===0?"—":p>=70?"✓ OK":"⚠ Below 70%"}</span>
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}

// ── Shared components ─────────────────────────────────────────────────────────
function Btn({ onClick, label, icon, primary, small, full, danger, style:st }) {
  return <button onClick={onClick} style={{...S.btn,...(primary?S.btnPrimary:danger?S.btnDanger:S.btnSecondary),...(small?{padding:"6px 14px",fontSize:12}:{}),...(full?{width:"100%"}:{}),...st}}>{icon&&<span style={{marginRight:6}}>{icon}</span>}{label}</button>;
}
function Field({ label, value, onChange, placeholder, type="text" }) {
  return <div style={{marginBottom:16}}><label style={S.label}>{label}</label><input type={type} style={S.input} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} /></div>;
}
function BackBtn({ onClick }) { return <div onClick={onClick} style={{cursor:"pointer",color:"#1d4ed8",fontSize:13,marginBottom:16,fontWeight:600}}>← Back</div>; }
function Empty({ msg }) { return <div style={{textAlign:"center",color:"#4b6cb7",padding:"40px 0",fontSize:14}}>{msg}</div>; }
function Chip({ label, value, color }) {
  return <div style={{...S.chip,borderColor:color}}><div style={{fontSize:22,fontWeight:800,color}}>{value}</div><div style={{fontSize:11,color:"#1e40af",marginTop:2,fontWeight:600}}>{label}</div></div>;
}
function Ring({ pct:p, size=60 }) {
  const r=size/2-6,circ=2*Math.PI*r,offset=circ-(p/100)*circ,col=p>=70?"#22c55e":p>=50?"#f59e0b":"#ef4444";
  return <svg width={size} height={size} style={{flexShrink:0}}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#dbeafe" strokeWidth={7}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={7} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/><text x="50%" y="54%" textAnchor="middle" fill={col} fontSize={size*0.22} fontWeight="700">{p}%</text></svg>;
}

// ── Student Instrument Tab ────────────────────────────────────────────────────
function StudentInstrumentTab({ student, studentInstruments, saveStudentInstrument, showToast }) {
  const myInstruments = (studentInstruments||[]).filter(i=>i.studentNo===student.studentNo);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name:"", type:"", serialNo:"", condition:"Good", notes:"" });
  const [editId, setEditId] = useState(null);
  const [damageNote, setDamageNote] = useState("");

  const TYPES      = ["String","Wind","Keyboard","Percussion","Vocal","Other"];
  const CONDITIONS = ["Good","Fair","Poor","Under Repair","Damaged"];
  const condColor  = (c) => c==="Good"?"#16a34a":c==="Fair"?"#d97706":c==="Poor"?"#dc2626":c==="Under Repair"?"#1d4ed8":"#dc2626";

  const submitInstrument = () => {
    if (!form.name.trim()) return showToast("Instrument name is required","error");
    if (editId) {
      saveStudentInstrument({...(studentInstruments||[]).find(i=>i.id===editId)||{},...form,id:editId,updatedAt:new Date().toISOString()});
      showToast("Instrument record updated.");
      setEditId(null);
    } else {
      const inst = {
        id: Date.now().toString(),
        studentNo: student.studentNo,
        studentName: student.name,
        ...form,
        registeredAt: new Date().toISOString(),
        ownership: "department",
        damageReports: []
      };
      saveStudentInstrument(inst);
      showToast("Instrument registered successfully!");
    }
    setForm({ name:"", type:"", serialNo:"", condition:"Good", notes:"" });
    setShowForm(false);
  };

  const reportDamage = (id) => {
    if (!damageNote.trim()) return showToast("Please describe the damage","error");
    const existing = (studentInstruments||[]).find(i=>i.id===id);
    if (existing) saveStudentInstrument({...existing,condition:"Damaged",damageReports:[...(existing.damageReports||[]),{note:damageNote,reportedAt:new Date().toISOString(),reportedBy:student.name}]});
    setDamageNote("");
    showToast("Damage report submitted.");
  };

  const startEdit = (inst) => {
    setForm({ name:inst.name, type:inst.type, serialNo:inst.serialNo||"", condition:inst.condition, notes:inst.notes||"" });
    setEditId(inst.id);
    setShowForm(true);
  };

  return (
    <div style={S.listWrap}>
      <div style={{...S.formCard,borderColor:"#1d4ed8"}}>
        <div style={{fontSize:12,color:"#1e40af",marginBottom:12}}>
          Register any department instrument assigned to you. This helps the department keep an accurate inventory record.
        </div>
        {!showForm
          ? <Btn onClick={()=>{setShowForm(true);setEditId(null);setForm({name:"",type:"",serialNo:"",condition:"Good",notes:""}); }} label="➕ Register an Instrument" primary full />
          : <div>
              <div style={{fontWeight:700,marginBottom:12,color:"#1e3a5f"}}>{editId?"Edit Instrument":"Register Department Instrument"}</div>
              <Field label="Instrument Name" value={form.name} onChange={v=>setForm(p=>({...p,name:v}))} placeholder="e.g. Trumpet, Classical Guitar" />
              <div style={{marginBottom:16}}>
                <label style={S.label}>Type</label>
                <select style={S.select} value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
                  <option value="">Select type</option>
                  {TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <Field label="Serial Number (if visible)" value={form.serialNo} onChange={v=>setForm(p=>({...p,serialNo:v}))} placeholder="e.g. GTR-001 or leave blank" />
              <div style={{marginBottom:16}}>
                <label style={S.label}>Current Condition</label>
                <select style={S.select} value={form.condition} onChange={e=>setForm(p=>({...p,condition:e.target.value}))}>
                  {CONDITIONS.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <Field label="Notes (optional)" value={form.notes} onChange={v=>setForm(p=>({...p,notes:v}))} placeholder="Any additional information" />
              <div style={{display:"flex",gap:8}}>
                <Btn onClick={submitInstrument} label={editId?"Update":"Register"} primary small />
                <Btn onClick={()=>{setShowForm(false);setEditId(null);}} label="Cancel" small />
              </div>
            </div>
        }
      </div>

      {myInstruments.length===0
        ? <Empty msg="You have not registered any department instrument yet." />
        : myInstruments.map(inst=>(
          <div key={inst.id} style={S.formCard}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <div>
                <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f"}}>{inst.name}</div>
                <div style={{fontSize:12,color:"#4b6cb7"}}>{inst.type}{inst.serialNo?" · S/N: "+inst.serialNo:""}</div>
                <div style={{fontSize:11,color:"#4b6cb7",marginTop:2}}>Registered: {new Date(inst.registeredAt).toLocaleDateString()}</div>
                {inst.notes&&<div style={{fontSize:12,color:"#4b6cb7",marginTop:2}}>{inst.notes}</div>}
              </div>
              <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,
                background:condColor(inst.condition)+"22",color:condColor(inst.condition)}}>
                {inst.condition}
              </span>
            </div>

            {(inst.damageReports||[]).length>0&&(
              <div style={{background:"#fee2e2",borderRadius:8,padding:"8px 10px",marginBottom:8}}>
                <div style={{fontSize:11,color:"#be123c",fontWeight:700,marginBottom:4}}>⚠ Damage Reports</div>
                {inst.damageReports.map((r,i)=>(
                  <div key={i} style={{fontSize:12,color:"#be123c"}}>{new Date(r.reportedAt).toLocaleDateString()}: {r.note}</div>
                ))}
              </div>
            )}

            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              <Btn onClick={()=>startEdit(inst)} label="✏ Edit" small />
            </div>

            <div style={{borderTop:"1px solid #dbeafe",paddingTop:8,marginTop:4}}>
              <input style={{...S.input,marginBottom:6,fontSize:12}} placeholder="Report damage or issue..."
                value={damageNote} onChange={e=>setDamageNote(e.target.value)} />
              <Btn onClick={()=>reportDamage(inst.id)} label="⚠ Report Damage" small danger />
            </div>
          </div>
        ))
      }
    </div>
  );
}

// ── Inventory Student Store Card (isolated) ──────────────────────────────────
function InvStudentStoreCard({ inst, available, condColor, myLoan, myPending, student, saveLoan, showToast }) {
  const [showReq, setShowReq] = useState(false);
  const [reqNote, setReqNote] = useState("");
  return (
    <div style={S.formCard}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
        <div>
          <div style={{fontWeight:700,fontSize:14,color:"#1e3a5f"}}>{inst.name}</div>
          <div style={{fontSize:12,color:"#4b6cb7"}}>{inst.type}</div>
        </div>
        <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,
          background:condColor(inst.condition)+"22",color:condColor(inst.condition)}}>
          {inst.condition}
        </span>
      </div>
      <div style={{fontSize:12,marginBottom:8,fontWeight:600,color:available>0?"#16a34a":"#dc2626"}}>
        {available>0?`${available} available`:"Currently unavailable"}
      </div>
      {myLoan&&<div style={{fontSize:12,color:"#d97706",marginBottom:6,fontWeight:600}}>✓ You currently have this instrument</div>}
      {myPending&&<div style={{fontSize:12,color:"#1d4ed8",marginBottom:6,fontWeight:600}}>⏳ Your request is pending approval</div>}
      {!myLoan&&!myPending&&available>0&&(
        showReq
          ? <div>
              <input style={{...S.input,marginBottom:8,fontSize:13}}
                placeholder="Why do you need this instrument?"
                value={reqNote} onChange={e=>setReqNote(e.target.value)} />
              <div style={{display:"flex",gap:6}}>
                <Btn onClick={()=>{
                  if(!reqNote.trim())return showToast("Please describe your purpose","error");
                  const loan={id:Date.now().toString(),instId:inst.id,borrowerName:student.name,
                    borrowerId:student.studentNo,borrowerType:"student",purpose:reqNote.trim(),
                    status:"pending",requestedAt:new Date().toISOString(),damageReports:[]};
                  saveLoan(loan);
                  setReqNote(""); setShowReq(false);
                  showToast("Request submitted — awaiting lecturer approval.");
                }} label="Submit Request" primary small />
                <Btn onClick={()=>setShowReq(false)} label="Cancel" small />
              </div>
            </div>
          : <Btn onClick={()=>setShowReq(true)} label="📤 Request to Borrow" small />
      )}
    </div>
  );
}

// ── Inventory Dashboard ───────────────────────────────────────────────────────
function InventoryDash({ instruments, setInstruments, loans, setLoans, studentInstruments, setStudentInstruments, students, lecturers, currentLecturer, setCurrentLecturer, setView, showToast, isAdmin }) {
  const [lecPin, setLecPin]               = useState("");
  const [invSno, setInvSno]               = useState("");
  const [invPwd, setInvPwd]               = useState("");
  const [invFoundStudent, setInvFoundStudent] = useState(null);
  const [invRole, setInvRole]             = useState(null);
  const [invStudent, setInvStudent]       = useState(null);
  const [tab, setTab]               = useState("inventory");
  const [showAddInst, setShowAddInst] = useState(false);
  const [newInst, setNewInst]       = useState({ name:"", type:"", serialNo:"", quantity:1, condition:"Good", location:"" });
  const [requestInstId, setRequestInstId] = useState(null);
  const [requestNote, setRequestNote] = useState("");
  const [damageNote, setDamageNote] = useState({});
  const [returnNote, setReturnNote] = useState({});

  const CONDITIONS = ["Good","Fair","Poor","Under Repair","Damaged"];
  const TYPES      = ["String","Wind","Keyboard","Percussion","Vocal","Other"];

  if (!currentLecturer && invRole === null) {
    return (
      <div style={S.center}>
        <div style={S.card}>
          <BackBtn onClick={() => setView("splash")} />
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:36,marginBottom:8}}>🎸</div>
            <h2 style={S.cardTitle}>Instrument Store</h2>
            <p style={S.cardSub}>NOCEN Department of Music</p>
          </div>
          <div style={{display:"flex",gap:12,flexDirection:"column"}}>
            <Btn onClick={()=>setInvRole("student")} label="I am a Student" icon="🎓" primary full />
            <Btn onClick={()=>setInvRole("lecturer")} label="I am a Lecturer / Admin" icon="🔐" full />
          </div>
        </div>
      </div>
    );
  }

  if (!currentLecturer && invRole === "student" && !invStudent) {
    return (
      <div style={S.center}>
        <div style={S.card}>
          <BackBtn onClick={() => setInvRole(null)} />
          <h2 style={S.cardTitle}>Student Access</h2>
          <p style={S.cardSub}>Enter your student number and password.</p>
          <Field label="Student Number" value={invSno} onChange={v=>{setInvSno(v);setInvFoundStudent(null);setInvPwd("");}} placeholder="e.g. 2021/001234" />
          {invFoundStudent && <Field label="Password" value={invPwd} onChange={setInvPwd} placeholder="Enter your password" type="password" />}
          <Btn onClick={() => {
            if (!invFoundStudent) {
              const found = (students||{})[invSno.trim()];
              if (!found) return showToast("Student number not found.", "error");
              setInvFoundStudent(found);
            } else {
              if (!invPwd.trim()) return showToast("Please enter your password", "error");
              if (invPwd !== invFoundStudent.password) return showToast("Incorrect password", "error");
              if (invFoundStudent.department === "borrowed") return showToast("The Instrument Store is only available to Music Department students.", "error");
              setInvStudent(invFoundStudent);
              showToast("Welcome, " + invFoundStudent.name.split(" ")[0]);
            }
          }} label={invFoundStudent?"Enter Store":"Continue"} primary full />
        </div>
      </div>
    );
  }

  if (!currentLecturer && invRole === "lecturer") {
    return (
      <div style={S.center}>
        <div style={S.card}>
          <BackBtn onClick={() => setInvRole(null)} />
          <h2 style={S.cardTitle}>Lecturer Access</h2>
          <p style={S.cardSub}>Enter your PIN to continue.</p>
          <Field label="PIN" value={lecPin} onChange={setLecPin} placeholder="••••" type="password" />
          <Btn onClick={() => {
            const found = (lecturers||[]).find(l => l.pin === lecPin.trim());
            if (!found) return showToast("Incorrect PIN", "error");
            setCurrentLecturer(found);
            showToast("Welcome, " + found.name);
          }} label="Enter Store" primary full />
        </div>
      </div>
    );
  }

  if (invStudent && !currentLecturer) {
    const activeLoansAll = (loans||[]).filter(l=>l.status==="active");
    const condColor = (c) => c==="Good"?"#16a34a":c==="Fair"?"#d97706":"#dc2626";
    return (
      <div style={S.page}>
        <div style={S.header}>
          <div style={S.headerInner}>
            <div>
              <div style={S.headerTitle}>Instrument Store</div>
              <div style={S.headerSub}>Welcome, {invStudent.name}</div>
            </div>
            <Btn onClick={()=>{setInvStudent(null);setInvRole(null);setView("splash");}} label="Exit" small />
          </div>
        </div>

        <div style={{...S.tabs,flexWrap:"wrap"}}>
          {[["store","🏛 Store Room"],["holdings","🎓 Student Holdings"],["myloans","📋 My Requests"],["myinstrument","🎸 My Instrument"]].map(([t,l])=>(
            <div key={t} style={{...S.tab,...(tab===t?S.tabActive:{})}} onClick={()=>setTab(t)}>
              {l}
            </div>
          ))}
        </div>

        {tab==="store" && (
          <div style={S.listWrap}>
            <div style={{...S.sectionHeader,background:"linear-gradient(135deg,#dbeafe,#e0f2fe)",borderColor:"#3b82f6",marginBottom:16}}>
              <div style={{fontWeight:700,color:"#1d4ed8",fontSize:13}}>🏛 Department Store Room</div>
              <div style={{fontSize:11,color:"#1e40af",marginTop:2}}>Browse available instruments and request to borrow</div>
            </div>
            {(instruments||[]).length===0
              ? <Empty msg="No instruments in the store room yet." />
              : (instruments||[]).map(inst=>{
                const onLoan=activeLoansAll.filter(l=>l.instId===inst.id).length;
                const available=Math.max(0,inst.quantity-onLoan);
                const myLoan=(loans||[]).find(l=>l.instId===inst.id&&l.borrowerId===invStudent.studentNo&&l.status==="active");
                const myPending=(loans||[]).find(l=>l.instId===inst.id&&l.borrowerId===invStudent.studentNo&&l.status==="pending");
                return (
                  <InvStudentStoreCard key={inst.id} inst={inst} available={available} condColor={condColor}
                    myLoan={myLoan} myPending={myPending} student={invStudent} saveLoan={saveLoan} showToast={showToast} />
                );
              })
            }
          </div>
        )}

        {tab==="holdings" && (
          <div style={S.listWrap}>
            <div style={{...S.sectionHeader,background:"linear-gradient(135deg,#dcfce7,#ecfdf5)",borderColor:"#22c55e",marginBottom:16}}>
              <div style={{fontWeight:700,color:"#15803d",fontSize:13}}>🎓 Instruments With Students</div>
              <div style={{fontSize:11,color:"#1e40af",marginTop:2}}>Department instruments declared by students</div>
            </div>
            {(studentInstruments||[]).length===0
              ? <Empty msg="No students have declared instruments yet." />
              : (studentInstruments||[]).map(inst=>{
                const isMe=inst.studentNo===invStudent.studentNo;
                return (
                  <div key={inst.id} style={{...S.classCard,borderColor:isMe?"#1d4ed8":"#bfdbfe"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:isMe?"#1d4ed8":"#1e3a5f"}}>{inst.name}</div>
                      <div style={{fontSize:12,color:"#4b6cb7"}}>{inst.type}</div>
                      <div style={{fontSize:12,color:isMe?"#1d4ed8":"#4b6cb7",marginTop:2,fontWeight:isMe?700:400}}>
                        {isMe?"👤 You":"👤 "+inst.studentName}
                      </div>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,flexShrink:0,
                      background:condColor(inst.condition)+"22",color:condColor(inst.condition)}}>
                      {inst.condition}
                    </span>
                  </div>
                );
              })
            }
          </div>
        )}

        {tab==="myloans" && (
          <div style={S.listWrap}>
            {(loans||[]).filter(l=>l.borrowerId===invStudent.studentNo).length===0
              ? <Empty msg="You have no instrument requests yet." />
              : [...(loans||[])].filter(l=>l.borrowerId===invStudent.studentNo).reverse().map(loan=>{
                const inst=(instruments||[]).find(i=>i.id===loan.instId);
                const statusColor=loan.status==="active"?"#d97706":loan.status==="pending"?"#1d4ed8":loan.status==="returned"?"#16a34a":"#dc2626";
                return (
                  <div key={loan.id} style={S.classCard}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:"#1e3a5f"}}>{inst?.name||"Unknown"}</div>
                      <div style={{fontSize:12,color:"#1e40af"}}>{loan.purpose}</div>
                      <div style={{fontSize:11,color:"#4b6cb7"}}>{new Date(loan.requestedAt).toLocaleDateString()}</div>
                      {(loan.damageReports||[]).length>0&&(
                        <div style={{fontSize:11,color:"#dc2626",marginTop:2}}>⚠ {loan.damageReports.length} damage report{loan.damageReports.length>1?"s":""}</div>
                      )}
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,flexShrink:0,
                      background:statusColor+"22",color:statusColor,textTransform:"capitalize"}}>
                      {loan.status}
                    </span>
                  </div>
                );
              })
            }
          </div>
        )}

        {tab==="myinstrument" && (
          <StudentInstrumentTab
            student={invStudent}
            studentInstruments={studentInstruments}
            saveStudentInstrument={saveStudentInstrument}
            showToast={showToast}
          />
        )}
      </div>
    );
  }

  const isLecturerAdmin = currentLecturer.isAdmin || currentLecturer.courses==="__all__" || currentLecturer.instrumentInCharge===true;

  const addInstrument = () => {
    if (!newInst.name.trim()) return showToast("Instrument name is required","error");
    const inst = { id: Date.now().toString(), ...newInst, quantity: Number(newInst.quantity), addedAt: new Date().toISOString(), damageHistory:[] };
    saveInstrument(inst);
    setNewInst({ name:"", type:"", serialNo:"", quantity:1, condition:"Good", location:"" });
    setShowAddInst(false);
    showToast("Instrument added to inventory.");
  };

  const updateCondition = (id, condition) => {
    const inst = (instruments||[]).find(i=>i.id===id);
    if (inst) saveInstrument({...inst, condition});
    showToast("Condition updated.");
  };

  const handleDeleteInstrument = (id) => {
    deleteInstrument(id);
    showToast("Instrument removed.");
  };

  const requestInstrument = (instId) => {
    if (!requestNote.trim()) return showToast("Please describe your purpose","error");
    const loan = {
      id: Date.now().toString(), instId,
      borrowerName: currentLecturer.name,
      borrowerId: currentLecturer.id,
      borrowerType: "lecturer",
      purpose: requestNote.trim(),
      status: "pending",
      requestedAt: new Date().toISOString(),
      damageReports: []
    };
    saveLoan(loan);
    setRequestInstId(null); setRequestNote("");
    showToast("Request submitted — waiting for approval.");
  };

  const approveLoan = (loanId) => {
    const loan=(loans||[]).find(l=>l.id===loanId); if(loan) saveLoan({...loan,status:"active",approvedAt:new Date().toISOString(),approvedBy:currentLecturer.name});
    showToast("Loan approved — instrument signed out.");
  };

  const rejectLoan = (loanId) => {
    const loan=(loans||[]).find(l=>l.id===loanId); if(loan) saveLoan({...loan,status:"rejected"});
    showToast("Request rejected.");
  };

  const returnInstrument = (loanId) => {
    const note = returnNote[loanId]||"";
    const loan=(loans||[]).find(l=>l.id===loanId);
    if(loan) saveLoan({...loan,status:"returned",returnedAt:new Date().toISOString(),returnNote:note});
    setReturnNote(prev => { const n={...prev}; delete n[loanId]; return n; });
    showToast("Instrument returned and recorded.");
  };

  const reportDamage = (loanId, reporter) => {
    const note = damageNote[loanId]||"";
    if (!note.trim()) return showToast("Please describe the damage","error");
    const loan=(loans||[]).find(l=>l.id===loanId);
    if(loan) saveLoan({...loan,damageReports:[...(loan.damageReports||[]),{note,reporter,reportedAt:new Date().toISOString()}]});
    setDamageNote(prev => { const n={...prev}; delete n[loanId]; return n; });
    showToast("Damage report recorded.");
  };

  const pendingLoans  = (loans||[]).filter(l=>l.status==="pending");
  const activeLoans   = (loans||[]).filter(l=>l.status==="active");
  const returnedLoans = (loans||[]).filter(l=>l.status==="returned"||l.status==="rejected");

  const getInst = (id) => (instruments||[]).find(i=>i.id===id);

  const condColor = (c) => c==="Good"?"#16a34a":c==="Fair"?"#d97706":c==="Poor"?"#dc2626":c==="Under Repair"?"#1d4ed8":"#dc2626";

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerInner}>
          <div>
            <div style={S.headerTitle}>Instrument Store</div>
            <div style={S.headerSub}>NOCEN Music Dept · {currentLecturer.name}
              {isLecturerAdmin&&<span style={{marginLeft:6,fontSize:10,background:"rgba(255,255,255,0.25)",color:"#fff",borderRadius:99,padding:"2px 6px",fontWeight:700}}>In Charge</span>}
              {!isLecturerAdmin&&<span style={{marginLeft:6,fontSize:10,background:"rgba(255,255,255,0.12)",color:"rgba(255,255,255,0.75)",borderRadius:99,padding:"2px 6px"}}>View Only</span>}
            </div>
          </div>
          <Btn onClick={()=>{setCurrentLecturer(null);setView("splash");}} label="Sign Out" small />
        </div>
      </div>

      <div style={S.chips}>
        <Chip label="In Store" value={(instruments||[]).reduce((a,i)=>a+Number(i.quantity||1),0)} color="#1d4ed8" />
        <Chip label="With Students" value={(studentInstruments||[]).length} color="#16a34a" />
        <Chip label="On Loan" value={activeLoans.length} color="#d97706" />
      </div>

      <div style={{...S.tabs,flexWrap:"wrap"}}>
        {[
          ["inventory","🎸 Inventory"],
          ["loans","📋 Active Loans"],
          ["history","🕐 History"],
          ["students","👥 Student Records"],
          ...(isLecturerAdmin?[["add","➕ Add Instrument"]]:[]),
        ].map(([t,l])=>(
          <div key={t} style={{...S.tab,...(tab===t?S.tabActive:{})}} onClick={()=>setTab(t)}>
            {l}{t==="pending"&&pendingLoans.length>0&&<span style={S.badge2}>{pendingLoans.length}</span>}
          </div>
        ))}
      </div>

      {tab==="inventory" && (
        <div style={S.listWrap}>

          {pendingLoans.length>0&&isLecturerAdmin&&(
            <div style={{...S.formCard,borderColor:"#f59e0b",marginBottom:16}}>
              <div style={{fontWeight:700,color:"#d97706",marginBottom:8}}>⏳ {pendingLoans.length} Pending Loan Request{pendingLoans.length>1?"s":""}</div>
              {pendingLoans.map(loan=>{
                const inst=getInst(loan.instId);
                return (
                  <div key={loan.id} style={{borderBottom:"1px solid #fde68a",paddingBottom:10,marginBottom:10}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#1e3a5f"}}>{loan.borrowerName}</div>
                    <div style={{fontSize:12,color:"#4b6cb7"}}>wants: {inst?.name||"Unknown"} · {loan.purpose}</div>
                    <div style={{display:"flex",gap:6,marginTop:6}}>
                      <Btn onClick={()=>approveLoan(loan.id)} label="✓ Approve" primary small />
                      <Btn onClick={()=>rejectLoan(loan.id)} label="✗ Reject" small danger />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{...S.sectionHeader, background:"linear-gradient(135deg,#dbeafe,#e0f2fe)", borderColor:"#3b82f6"}}>
            <div style={{fontWeight:700,color:"#1d4ed8",fontSize:13}}>🏛 Department Store Room</div>
            <div style={{fontSize:11,color:"#1e40af",marginTop:2}}>Instruments physically in the department — entered by lecturer in charge</div>
          </div>

          {(instruments||[]).length===0
            ? <div style={{textAlign:"center",color:"#4b6cb7",padding:"20px 0",fontSize:13}}>
                No store room instruments recorded yet.
                {isLecturerAdmin&&<div style={{marginTop:8}}><Btn onClick={()=>setTab("add")} label="➕ Add Instrument" small /></div>}
              </div>
            : (instruments||[]).map(inst=>{
              const onLoan = activeLoans.filter(l=>l.instId===inst.id).length;
              const available = Math.max(0, inst.quantity - onLoan);
              return (
                <div key={inst.id} style={S.formCard}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:15,color:"#1e3a5f"}}>{inst.name}</div>
                      <div style={{fontSize:12,color:"#4b6cb7"}}>{inst.type}{inst.serialNo?" · S/N: "+inst.serialNo:""}</div>
                      {inst.location&&<div style={{fontSize:12,color:"#4b6cb7"}}>📍 {inst.location}</div>}
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,
                      background:condColor(inst.condition)+"22",color:condColor(inst.condition)}}>
                      {inst.condition}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:16,marginBottom:10,flexWrap:"wrap"}}>
                    <div style={{fontSize:12,color:"#4b6cb7"}}>Qty: <b style={{color:"#1e3a5f"}}>{inst.quantity}</b></div>
                    <div style={{fontSize:12,color:"#4b6cb7"}}>On loan: <b style={{color:"#d97706"}}>{onLoan}</b></div>
                    <div style={{fontSize:12,color:"#4b6cb7"}}>Available: <b style={{color:available>0?"#16a34a":"#dc2626"}}>{available}</b></div>
                  </div>
                  {isLecturerAdmin&&(
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                      <select style={{...S.select,padding:"4px 8px",fontSize:12}} value={inst.condition}
                        onChange={e=>updateCondition(inst.id,e.target.value)}>
                        {CONDITIONS.map(c=><option key={c}>{c}</option>)}
                      </select>
                      <Btn onClick={()=>handleDeleteInstrument(inst.id)} label="🗑 Remove" small danger />
                    </div>
                  )}
                  {available>0&&(
                    requestInstId===inst.id
                      ? <div style={{marginTop:8}}>
                          <input style={{...S.input,marginBottom:8}} placeholder="Purpose / reason for borrowing"
                            value={requestNote} onChange={e=>setRequestNote(e.target.value)} />
                          <div style={{display:"flex",gap:6}}>
                            <Btn onClick={()=>requestInstrument(inst.id)} label="Submit Request" primary small />
                            <Btn onClick={()=>{setRequestInstId(null);setRequestNote("");}} label="Cancel" small />
                          </div>
                        </div>
                      : <Btn onClick={()=>setRequestInstId(inst.id)} label="📤 Request to Borrow" small />
                  )}
                  {available===0&&<div style={{fontSize:12,color:"#dc2626",marginTop:4,fontWeight:600}}>All units currently on loan</div>}
                </div>
              );
            })
          }

          <div style={{...S.sectionHeader, background:"linear-gradient(135deg,#dcfce7,#ecfdf5)", borderColor:"#22c55e", marginTop:16}}>
            <div style={{fontWeight:700,color:"#15803d",fontSize:13}}>🎓 Instruments With Students</div>
            <div style={{fontSize:11,color:"#1e40af",marginTop:2}}>Declared by students — department-issued instruments in student possession</div>
          </div>

          {(studentInstruments||[]).length===0
            ? <div style={{textAlign:"center",color:"#4b6cb7",padding:"20px 0",fontSize:13}}>No students have declared instruments yet.</div>
            : (studentInstruments||[]).map(inst=>(
              <div key={inst.id} style={{...S.classCard}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:"#1e3a5f"}}>{inst.name}</div>
                  <div style={{fontSize:12,color:"#4b6cb7"}}>{inst.type}{inst.serialNo?" · S/N: "+inst.serialNo:""}</div>
                  <div style={{fontSize:12,color:"#1d4ed8",marginTop:2,fontWeight:600}}>👤 {inst.studentName} · {inst.studentNo}</div>
                  {(inst.damageReports||[]).length>0&&(
                    <div style={{fontSize:11,color:"#dc2626",marginTop:2}}>⚠ {inst.damageReports.length} damage report{inst.damageReports.length>1?"s":""}</div>
                  )}
                </div>
                <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,flexShrink:0,
                  background:condColor(inst.condition)+"22",color:condColor(inst.condition)}}>
                  {inst.condition}
                </span>
              </div>
            ))
          }

        </div>
      )}

      {tab==="loans" && (
        <div style={S.listWrap}>
          {activeLoans.length===0?<Empty msg="No instruments currently on loan."/>:
            activeLoans.map(loan=>{
              const inst=getInst(loan.instId);
              const isMyLoan = loan.borrowerId===currentLecturer.id;
              return (
                <div key={loan.id} style={S.formCard}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:700,color:"#1e3a5f"}}>{inst?.name||"Unknown"}</div>
                      <div style={{fontSize:12,color:"#4b6cb7"}}>Borrowed by: {loan.borrowerName}</div>
                      <div style={{fontSize:12,color:"#1e40af"}}>Purpose: {loan.purpose}</div>
                      <div style={{fontSize:11,color:"#4b6cb7"}}>Since: {new Date(loan.approvedAt).toLocaleDateString()}</div>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,background:"#fef3c7",color:"#d97706"}}>On Loan</span>
                  </div>

                  {(loan.damageReports||[]).length>0&&(
                    <div style={{marginTop:8,background:"#fee2e2",borderRadius:8,padding:"8px 10px"}}>
                      <div style={{fontSize:11,color:"#be123c",fontWeight:700,marginBottom:4}}>⚠ Damage Reports</div>
                      {loan.damageReports.map((r,i)=>(
                        <div key={i} style={{fontSize:12,color:"#be123c",marginBottom:2}}>{r.reporter}: {r.note}</div>
                      ))}
                    </div>
                  )}

                  {(isMyLoan||isLecturerAdmin)&&(
                    <div style={{marginTop:8}}>
                      <input style={{...S.input,marginBottom:6,fontSize:12}} placeholder="Report damage (describe issue)..."
                        value={damageNote[loan.id]||""}
                        onChange={e=>setDamageNote(prev=>({...prev,[loan.id]:e.target.value}))} />
                      <Btn onClick={()=>reportDamage(loan.id, currentLecturer.name)} label="⚠ Report Damage" small danger />
                    </div>
                  )}

                  {isLecturerAdmin&&(
                    <div style={{marginTop:8,borderTop:"1px solid #dbeafe",paddingTop:8}}>
                      <input style={{...S.input,marginBottom:6,fontSize:12}} placeholder="Return note / condition on return (optional)"
                        value={returnNote[loan.id]||""}
                        onChange={e=>setReturnNote(prev=>({...prev,[loan.id]:e.target.value}))} />
                      <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                        <select style={{...S.select,padding:"4px 8px",fontSize:12}} onChange={e=>updateCondition(loan.instId,e.target.value)}>
                          {CONDITIONS.map(c=><option key={c}>{c}</option>)}
                        </select>
                        <Btn onClick={()=>returnInstrument(loan.id)} label="✓ Record Return" primary small />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          }
        </div>
      )}

      {tab==="history" && (
        <div style={S.listWrap}>
          {returnedLoans.length===0?<Empty msg="No returned or rejected loans yet."/>:
            [...returnedLoans].reverse().map(loan=>{
              const inst=getInst(loan.instId);
              return (
                <div key={loan.id} style={{...S.classCard,flexDirection:"column",alignItems:"flex-start"}}>
                  <div style={{display:"flex",justifyContent:"space-between",width:"100%"}}>
                    <div>
                      <div style={{fontWeight:700,color:"#1e3a5f"}}>{inst?.name||"Unknown"}</div>
                      <div style={{fontSize:12,color:"#4b6cb7"}}>{loan.borrowerName} · {loan.purpose}</div>
                      <div style={{fontSize:11,color:"#4b6cb7"}}>
                        {loan.status==="returned"
                          ? `Returned: ${new Date(loan.returnedAt).toLocaleDateString()}`
                          : "Rejected"}
                      </div>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,
                      background:loan.status==="returned"?"#dcfce7":"#fee2e2",
                      color:loan.status==="returned"?"#16a34a":"#dc2626"}}>
                      {loan.status==="returned"?"Returned":"Rejected"}
                    </span>
                  </div>
                  {(loan.damageReports||[]).length>0&&(
                    <div style={{marginTop:6,fontSize:12,color:"#dc2626"}}>
                      ⚠ {loan.damageReports.length} damage report{loan.damageReports.length>1?"s":""}
                    </div>
                  )}
                  {loan.returnNote&&<div style={{fontSize:12,color:"#4b6cb7",marginTop:4}}>Note: {loan.returnNote}</div>}
                </div>
              );
            })
          }
        </div>
      )}

      {tab==="students"&&(
        <div style={S.listWrap}>
          {(studentInstruments||[]).length===0
            ? <Empty msg="No students have registered instruments yet."/>
            : <>
                <div style={S.formCard}>
                  <div style={{fontWeight:700,color:"#1e3a5f",marginBottom:10}}>Department Instrument Summary</div>
                  {["String","Wind","Keyboard","Percussion","Vocal","Other"].map(type=>{
                    const count=(studentInstruments||[]).filter(i=>i.type===type).length;
                    if(!count) return null;
                    return <div key={type} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #dbeafe",fontSize:13}}>
                      <span style={{color:"#1e40af"}}>{type}</span>
                      <span style={{color:"#1d4ed8",fontWeight:700}}>{count}</span>
                    </div>;
                  })}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:13,fontWeight:700}}>
                    <span style={{color:"#1e3a5f"}}>Total</span>
                    <span style={{color:"#16a34a"}}>{(studentInstruments||[]).length}</span>
                  </div>
                </div>
                <Btn onClick={()=>{
                  const rows=[["Student Name","Student No","Instrument","Type","Serial No","Condition","Registered","Notes","Damage Reports"]];
                  (studentInstruments||[]).forEach(i=>{
                    rows.push([i.studentName,i.studentNo,i.name,i.type,i.serialNo||"",i.condition,new Date(i.registeredAt).toLocaleDateString(),i.notes||"",(i.damageReports||[]).length]);
                  });
                  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
                  const blob=new Blob([csv],{type:"text/csv"});
                  const url=URL.createObjectURL(blob);
                  const a=document.createElement("a"); a.href=url; a.download=`NOCEN_Instrument_Register_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
                  showToast("Instrument register exported!");
                }} label="📥 Export Instrument Register" primary full style={{marginBottom:12}} />
                {[...(studentInstruments||[])].sort((a,b)=>a.studentName.localeCompare(b.studentName)).map(inst=>{
                  const cColor=(c)=>c==="Good"?"#16a34a":c==="Fair"?"#d97706":"#dc2626";
                  return (
                    <div key={inst.id} style={S.classCard}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700,color:"#1e3a5f"}}>{inst.studentName}</div>
                        <div style={{fontSize:12,color:"#4b6cb7"}}>{inst.studentNo}</div>
                        <div style={{fontSize:13,color:"#1e40af",marginTop:4}}>{inst.name} · {inst.type}</div>
                        {inst.serialNo&&<div style={{fontSize:11,color:"#4b6cb7"}}>S/N: {inst.serialNo}</div>}
                        {(inst.damageReports||[]).length>0&&<div style={{fontSize:11,color:"#dc2626",marginTop:2}}>⚠ {inst.damageReports.length} damage report{inst.damageReports.length>1?"s":""}</div>}
                      </div>
                      <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,
                        background:cColor(inst.condition)+"22",color:cColor(inst.condition),flexShrink:0}}>
                        {inst.condition}
                      </span>
                    </div>
                  );
                })}
              </>
          }
        </div>
      )}

      {tab==="add"&&isLecturerAdmin&&(
        <div style={S.listWrap}>
          <div style={S.formCard}>
            <div style={{fontWeight:700,marginBottom:12,color:"#1e3a5f"}}>Add Instrument to Inventory</div>
            <Field label="Instrument Name" value={newInst.name} onChange={v=>setNewInst(p=>({...p,name:v}))} placeholder="e.g. Trumpet, Classical Guitar" />
            <div style={{marginBottom:16}}>
              <label style={S.label}>Type</label>
              <select style={S.select} value={newInst.type} onChange={e=>setNewInst(p=>({...p,type:e.target.value}))}>
                <option value="">Select type</option>
                {TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <Field label="Serial Number (optional)" value={newInst.serialNo} onChange={v=>setNewInst(p=>({...p,serialNo:v}))} placeholder="e.g. TRP-2024-001" />
            <div style={{marginBottom:16}}>
              <label style={S.label}>Quantity</label>
              <input type="number" min="1" style={S.input} value={newInst.quantity} onChange={e=>setNewInst(p=>({...p,quantity:e.target.value}))} />
            </div>
            <div style={{marginBottom:16}}>
              <label style={S.label}>Condition</label>
              <select style={S.select} value={newInst.condition} onChange={e=>setNewInst(p=>({...p,condition:e.target.value}))}>
                {CONDITIONS.map(c=><option key={c}>{c}</option>)}
              </select>
            </div>
            <Field label="Storage Location (optional)" value={newInst.location} onChange={v=>setNewInst(p=>({...p,location:v}))} placeholder="e.g. Music Store Room 1" />
            <Btn onClick={addInstrument} label="Add to Inventory" primary full />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root:{ minHeight:"100vh",background:"#eef2ff",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#1e3a5f",position:"relative",overflowX:"hidden" },
  grain:{ display:"none" },
  center:{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:16,position:"relative",zIndex:1,background:"linear-gradient(135deg,#c7d7fd 0%,#e0f0ff 50%,#bfdbfe 100%)" },
  splashCard:{ background:"#ffffff",borderRadius:28,padding:48,textAlign:"center",maxWidth:400,width:"100%",boxShadow:"0 20px 60px rgba(37,99,235,0.2),0 4px 16px rgba(0,0,0,0.08)" },
  logo:{ fontSize:52,marginBottom:12 },
  logoCrest:{ width:100,height:100,borderRadius:"50%",background:"#f0f6ff",border:"3px solid #1d4ed8",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",boxShadow:"0 4px 20px rgba(29,78,216,0.3)",overflow:"hidden",padding:4 },
  schoolName:{ fontSize:13,fontWeight:800,color:"#1d4ed8",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:2 },
  deptName:{ fontSize:12,color:"#0369a1",marginBottom:16,fontWeight:600 },
  copyright:{ marginTop:24,fontSize:11,color:"#6b7280",borderTop:"1px solid #dbeafe",paddingTop:12 },
  splashTitle:{ margin:0,fontSize:34,fontWeight:800,letterSpacing:"-1px",background:"linear-gradient(135deg,#1d4ed8,#0369a1)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" },
  splashSub:{ color:"#1e40af",marginTop:8,fontSize:14,fontWeight:600 },
  card:{ background:"#ffffff",borderRadius:20,padding:32,maxWidth:420,width:"100%",boxShadow:"0 8px 32px rgba(29,78,216,0.15),0 2px 8px rgba(0,0,0,0.06)" },
  cardTitle:{ margin:"0 0 6px",fontSize:22,fontWeight:800,color:"#1e3a5f" },
  cardSub:{ color:"#1e40af",fontSize:13,marginBottom:24,fontWeight:500 },
  page:{ maxWidth:620,margin:"0 auto",padding:"0 0 40px",position:"relative",zIndex:1 },
  header:{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0",marginBottom:0,background:"linear-gradient(135deg,#1e3a8a,#0369a1)",color:"#fff" },
  headerInner:{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",width:"100%",marginBottom:20 },
  headerTitle:{ fontSize:20,fontWeight:800,color:"#ffffff",letterSpacing:"-0.5px" },
  headerSub:{ fontSize:12,color:"rgba(255,255,255,0.85)",fontWeight:500 },
  overallBar:{ display:"flex",alignItems:"center",background:"linear-gradient(135deg,#eff6ff,#f0f9ff)",border:"1.5px solid #bfdbfe",borderRadius:16,padding:"16px 20px",margin:"0 16px 20px",boxShadow:"0 2px 12px rgba(29,78,216,0.1)" },
  tabs:{ display:"flex",gap:4,padding:"0 16px",marginBottom:12,overflowX:"auto" },
  tab:{ padding:"8px 16px",borderRadius:10,fontSize:13,cursor:"pointer",color:"#1e40af",background:"transparent",userSelect:"none",position:"relative",whiteSpace:"nowrap",fontWeight:600 },
  tabActive:{ background:"linear-gradient(135deg,#1d4ed8,#0369a1)",color:"#ffffff",fontWeight:700,boxShadow:"0 2px 8px rgba(29,78,216,0.35)" },
  listWrap:{ padding:"0 16px" },
  classCard:{ display:"flex",alignItems:"center",gap:12,background:"#ffffff",border:"1.5px solid #bfdbfe",borderRadius:14,padding:"14px 16px",marginBottom:10,boxShadow:"0 2px 8px rgba(29,78,216,0.07)" },
  courseCard:{ background:"#ffffff",border:"1.5px solid #bfdbfe",borderRadius:14,padding:"14px 16px",marginBottom:10,boxShadow:"0 2px 8px rgba(29,78,216,0.07)" },
  formCard:{ background:"#ffffff",border:"1.5px solid #bfdbfe",borderRadius:14,padding:18,marginBottom:16,boxShadow:"0 2px 8px rgba(29,78,216,0.07)" },
  barBg:{ height:8,background:"#dbeafe",borderRadius:99,overflow:"hidden",marginTop:6 },
  barFill:{ height:"100%",borderRadius:99,transition:"width .4s ease" },
  btn:{ border:"none",borderRadius:10,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:"pointer",transition:"all .15s",display:"inline-flex",alignItems:"center",justifyContent:"center" },
  btnPrimary:{ background:"linear-gradient(135deg,#1d4ed8,#0369a1)",color:"#fff",boxShadow:"0 3px 10px rgba(29,78,216,0.35)" },
  btnSecondary:{ background:"#eff6ff",color:"#1d4ed8",border:"1.5px solid #bfdbfe",fontWeight:700 },
  btnDanger:{ background:"#fff1f2",color:"#be123c",border:"1.5px solid #fecdd3",fontWeight:700 },
  label:{ display:"block",fontSize:12,color:"#1e40af",marginBottom:6,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.3px" },
  input:{ width:"100%",boxSizing:"border-box",background:"#f0f7ff",border:"1.5px solid #93c5fd",borderRadius:10,padding:"10px 14px",color:"#1e3a5f",fontSize:14,outline:"none",fontWeight:500 },
  select:{ background:"#f0f7ff",border:"1.5px solid #93c5fd",borderRadius:10,padding:"10px 14px",color:"#1e3a5f",fontSize:13,outline:"none",fontWeight:500 },
  badge:{ display:"inline-block",fontSize:10,background:"#fef3c7",color:"#b45309",borderRadius:99,padding:"2px 8px",marginTop:4,fontWeight:700 },
  badge2:{ display:"inline-block",background:"#dc2626",color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 6px",marginLeft:6 },
  chips:{ display:"flex",gap:10,padding:"0 16px",marginBottom:20 },
  chip:{ flex:1,background:"#ffffff",border:"2px solid",borderRadius:14,padding:"12px 16px",textAlign:"center",boxShadow:"0 2px 8px rgba(29,78,216,0.08)" },
  overlay:{ position:"fixed",inset:0,background:"rgba(15,23,42,0.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 },
  modal:{ background:"#ffffff",borderRadius:20,padding:24,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.2)" },
  toast:{ position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",padding:"12px 28px",borderRadius:12,color:"#fff",fontSize:13,fontWeight:700,zIndex:200,boxShadow:"0 8px 24px rgba(0,0,0,.2)" },
  courseChip:{ padding:"6px 14px",borderRadius:99,fontSize:12,cursor:"pointer",background:"#eff6ff",color:"#1d4ed8",border:"1.5px solid #93c5fd",fontWeight:600 },
  courseChipActive:{ background:"#1d4ed8",color:"#ffffff",border:"1.5px solid #1d4ed8",fontWeight:700 },
  todayBanner:{ display:"flex",alignItems:"center",gap:12,background:"linear-gradient(135deg,#dbeafe,#e0f2fe)",border:"2px solid #3b82f6",borderRadius:14,padding:"14px 16px",margin:"0 16px 16px" },
  codeInput:{ width:120,background:"#eff6ff",border:"3px solid #1d4ed8",borderRadius:8,padding:"8px 10px",color:"#1d4ed8",fontSize:20,fontWeight:800,letterSpacing:6,textAlign:"center",outline:"none" },
  sectionHeader:{ border:"2px solid",borderRadius:12,padding:"12px 16px",marginBottom:12 },
  installBanner:{ display:"flex",alignItems:"flex-start",gap:12,background:"#ffffff",border:"1.5px solid #93c5fd",borderRadius:14,padding:"14px 16px",marginTop:24,maxWidth:400,width:"100%",boxShadow:"0 4px 16px rgba(29,78,216,0.12)" },
};

export default function App() {
  return (
    <AppErrorBoundary>
      <AppInner />
    </AppErrorBoundary>
  );
}
