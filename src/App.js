import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, onSnapshot, collection,
  getDocs, deleteDoc
} from "firebase/firestore";

// ── Helpers ──────────────────────────────────────────────────────────────────
const pct = (a, t) => t === 0 ? 0 : Math.round((a / t) * 100);
const pctColor = (p) => p >= 75 ? "#22c55e" : p >= 50 ? "#f59e0b" : "#ef4444";
const genCode = () => String(Math.floor(1000 + Math.random() * 9000));

const DEFAULT_LECTURERS = [
  { id: "admin", name: "Admin / HOD", pin: "1234", courses: "__all__", isAdmin: true }
];

// ── Firebase read/write ───────────────────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
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
  const [instruments, setInstruments] = useState(null);  // inventory
  const [loans, setLoans]             = useState(null);   // loan requests & active loans
  const [studentInstruments, setStudentInstruments] = useState(null); // student declared instruments

  // Load from Firestore on mount — NEVER overwrite Firebase data with defaults
  useEffect(() => {
    (async () => {
      const s  = await fbGet("attendtrack/students");  setStudents(s  ?? {});
      const c  = await fbGet("attendtrack/classes");   setClasses(c   ?? []);
      const r  = await fbGet("attendtrack/records");   setRecords(r   ?? {});
      const p  = await fbGet("attendtrack/pending");   setPending(p   ?? {});
      const co = await fbGet("attendtrack/courses");   setCourses(co  ?? []);
      const lc = await fbGet("attendtrack/lecturers"); setLecturers(lc ?? DEFAULT_LECTURERS);
      const inv = await fbGet("attendtrack/instruments"); setInstruments(inv ?? []);
      const ln  = await fbGet("attendtrack/loans");       setLoans(ln ?? []);
      const si  = await fbGet("attendtrack/studentInstruments"); setStudentInstruments(si ?? []);
      setLoading(false);
    })();
  }, []);

  // Save to Firestore — only after loading is complete AND value is not null
  useEffect(() => { if (!loading && students  !== null) fbSet("attendtrack/students",  students);  }, [students,  loading]);
  useEffect(() => { if (!loading && classes   !== null) fbSet("attendtrack/classes",   classes);   }, [classes,   loading]);
  useEffect(() => { if (!loading && records   !== null) fbSet("attendtrack/records",   records);   }, [records,   loading]);
  useEffect(() => { if (!loading && pending   !== null) fbSet("attendtrack/pending",   pending);   }, [pending,   loading]);
  useEffect(() => { if (!loading && courses   !== null) fbSet("attendtrack/courses",   courses);   }, [courses,   loading]);
  useEffect(() => { if (!loading && lecturers    !== null) fbSet("attendtrack/lecturers",  lecturers);   }, [lecturers,    loading]);
  useEffect(() => { if (!loading && instruments !== null) fbSet("attendtrack/instruments", instruments); }, [instruments, loading]);
  useEffect(() => { if (!loading && loans               !== null) fbSet("attendtrack/loans",             loans);             }, [loans,             loading]);
  useEffect(() => { if (!loading && studentInstruments !== null) fbSet("attendtrack/studentInstruments", studentInstruments); }, [studentInstruments, loading]);

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
      {view === "register" && <Register students={students} setStudents={setStudents} setView={setView} showToast={showToast} setCurrentStudent={setCurrentStudent} />}
      {view === "sign-in"  && <SignInStudent students={students} setStudents={setStudents} setView={setView} showToast={showToast} setCurrentStudent={setCurrentStudent} />}
      {view === "student"  && currentStudent && (
        <StudentDash student={currentStudent} classes={classes} confirmedClasses={confirmedClasses}
          records={records} pending={pending} setPending={setPending} courses={courses}
          studentStats={studentStats} setView={setView} showToast={showToast} pct={pct} pctColor={pctColor}
          studentInstruments={studentInstruments} setStudentInstruments={setStudentInstruments}
          instruments={instruments} loans={loans} setLoans={setLoans} />
      )}
      {view === "inventory" && (
        <InventoryDash
          instruments={instruments} setInstruments={setInstruments}
          loans={loans} setLoans={setLoans}
          studentInstruments={studentInstruments}
          students={students} lecturers={lecturers}
          currentLecturer={currentLecturer} setCurrentLecturer={setCurrentLecturer}
          setView={setView} showToast={showToast} isAdmin={currentLecturer?.isAdmin||false} />
      )}
      {view === "lecturer" && (
        <LecturerDash currentLecturer={currentLecturer} setCurrentLecturer={setCurrentLecturer}
          lecturers={lecturers} setLecturers={setLecturers} students={students}
          classes={classes} setClasses={setClasses} records={records} setRecords={setRecords}
          pending={pending} setPending={setPending} courses={courses} setCourses={setCourses}
          setView={setView} showToast={showToast} confirmedClasses={confirmedClasses}
          studentStats={studentStats} pct={pct} pctColor={pctColor}
          myCoursesForLecturer={myCoursesForLecturer} />
      )}
    </div>
  );
}

// ── Splash ────────────────────────────────────────────────────────────────────
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
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────
function Register({ students, setStudents, setView, showToast, setCurrentStudent }) {
  const [name, setName]       = useState("");
  const [sno, setSno]         = useState("");
  const [pwd, setPwd]         = useState("");
  const [pwd2, setPwd2]       = useState("");
  const submit = () => {
    if (!name.trim() || !sno.trim()) return showToast("Please fill all fields", "error");
    if (!pwd.trim()) return showToast("Please create a password", "error");
    if (pwd.length < 4) return showToast("Password must be at least 4 characters", "error");
    if (pwd !== pwd2) return showToast("Passwords do not match", "error");
    if (students[sno.trim()]) return showToast("Student number already registered", "error");
    const student = { name: name.trim(), studentNo: sno.trim(), password: pwd };
    setStudents(prev => ({ ...prev, [sno.trim()]: student }));
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
        <Field label="Create Password" value={pwd} onChange={setPwd} placeholder="Minimum 4 characters" type="password" />
        <Field label="Confirm Password" value={pwd2} onChange={setPwd2} placeholder="Re-enter your password" type="password" />
        <Btn onClick={submit} label="Register & Continue" primary full />
      </div>
    </div>
  );
}

// ── Sign In Student ───────────────────────────────────────────────────────────
function SignInStudent({ students, setStudents, setView, showToast, setCurrentStudent }) {
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
    // Existing student with no password — prompt to set one
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
    setStudents(prev => ({ ...prev, [foundStudent.studentNo]: updated }));
    setCurrentStudent(updated);
    showToast("Password set! Welcome back, " + foundStudent.name.split(" ")[0] + "!");
    setView("student");
  };

  // First-time password setup for existing students
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
        <p style={{ textAlign:"center", marginTop:16, fontSize:13, color:"#94a3b8" }}>
          First time? <span style={{ color:"#6366f1", cursor:"pointer" }} onClick={() => setView("register")}>Register here</span>
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
  return <span style={{fontSize:12,color:remaining<60000?"#ef4444":"#22c55e",fontWeight:700}}>⏱ {mins}:{String(secs).padStart(2,"0")} remaining</span>;
}

// ── Student Dashboard ─────────────────────────────────────────────────────────
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
    if (!typed) return showToast("Please enter the attendance code", "error");
    if (typed !== correctCode) return showToast("Incorrect code. Check the board and try again.", "error");
    setPending(prev => {
      const list = prev[classId]||[];
      if (list.includes(student.studentNo)) return prev;
      return { ...prev, [classId]: [...list, student.studentNo] };
    });
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
          <div style={{ fontSize:13, color:"#64748b", marginBottom:2 }}>Overall Attendance</div>
          <div style={{ fontSize:28, fontWeight:700, color:pctColor(totalPct()) }}>{totalPct()}%</div>
          <div style={{ fontSize:12, color: totalPct()>=75?"#22c55e":"#ef4444" }}>
            {totalPct()>=75?"✓ Satisfactory":"⚠ Below Required 75%"}
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
                  <div style={{fontWeight:700,fontSize:15}}>{cls.courseCode}</div>
                  <div style={{fontSize:13,color:"#94a3b8",marginTop:2}}>{cls.topic||"Class"} · {cls.date}</div>
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
                  : <span style={{fontSize:12,color:"#f59e0b"}}>Locked</span>}
              </div>
            ))}
        </div>
      )}
      {tab==="overview" && (
        <div style={S.listWrap}>
          {courses.map(code=>{
            const s=stats[code]; const p=pct(s.attended,s.total);
            return (
              <div key={code} style={S.courseCard}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontWeight:700}}>{code}</span>
                  <span style={{color:pctColor(p),fontWeight:700}}>{p}%</span>
                </div>
                <div style={S.barBg}><div style={{...S.barFill,width:p+"%",background:pctColor(p)}}/></div>
                <div style={{fontSize:12,color:"#94a3b8",marginTop:6}}>{s.attended}/{s.total} classes attended</div>
              </div>
            );
          })}
        </div>
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
  if (remaining<=0) return <span style={{fontSize:11,background:"#7f1d1d",color:"#fca5a5",borderRadius:6,padding:"3px 8px",fontWeight:600}}>⏰ Closed</span>;
  const mins=Math.floor(remaining/60000), secs=Math.floor((remaining%60000)/1000);
  return <span style={{fontSize:12,background:remaining<60000?"#7f1d1d":"#14532d",color:remaining<60000?"#fca5a5":"#86efac",borderRadius:6,padding:"3px 8px",fontWeight:700}}>⏱ {mins}:{String(secs).padStart(2,"0")} left</span>;
}

// ── Lecturer Login ─────────────────────────────────────────────────────────────
function LecturerLogin({ lecturers, onLogin, setView }) {
  const [pin, setPin] = useState("");
  const attempt = () => {
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
function LecturerDash({ currentLecturer, setCurrentLecturer, lecturers, setLecturers, students, classes, setClasses, records, setRecords, pending, setPending, courses, setCourses, setView, showToast, confirmedClasses, studentStats, pct, pctColor, myCoursesForLecturer }) {

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
  const [manualClassId, setManualClassId] = useState(null); // class being manually marked

  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));

  const addCls = () => {
    const code = newClass.courseCode.trim().toUpperCase();
    if (!newClass.date || !code) return showToast("Fill course code and date", "error");
    setCourses(prev => prev.includes(code) ? prev : [...prev, code]);
    if (!isAdmin) {
      const myAssigned = Array.isArray(currentLecturer.courses) ? currentLecturer.courses : [];
      if (!myAssigned.includes(code)) {
        const updated = { ...currentLecturer, courses: [...myAssigned, code] };
        setLecturers(prev => prev.map(l => l.id===currentLecturer.id ? updated : l));
        setCurrentLecturer(updated);
      }
    }
    const cls = { id: Date.now().toString(), courseCode: code, date: newClass.date, topic: newClass.topic, confirmed: false, lecturerId: currentLecturer.id };
    setClasses(prev => [...prev, cls]);
    showToast("Class session created. Confirm it to open for students.");
    setNewClass({ courseCode:"", date:"", topic:"" });
  };

  const confirmClass = (id) => {
    const code = genCode();
    setClasses(prev => prev.map(c => c.id===id ? { ...c, confirmed:true, attendCode:code, expiresAt: Date.now()+signDuration*60*1000 } : c));
    showToast("Class confirmed! Code: " + code + " (" + signDuration + " min)");
  };

  const deleteClass = (id) => {
    setClasses(prev => prev.filter(c => c.id!==id));
    setRecords(prev => { const n={...prev}; delete n[id]; return n; });
    setPending(prev => { const n={...prev}; delete n[id]; return n; });
    showToast("Class session removed.");
  };

  const toggleManualAttendance = (classId, studentNo) => {
    setRecords(prev => {
      const list = prev[classId] || [];
      const updated = list.includes(studentNo)
        ? list.filter(s => s !== studentNo)
        : [...list, studentNo];
      return { ...prev, [classId]: updated };
    });
  };

  const saveManualAttendance = (classId) => {
    // Remove from pending if confirmed manually
    setPending(prev => { const n={...prev}; delete n[classId]; return n; });
    setManualClassId(null);
    showToast("Attendance saved successfully!");
  };

  const approveStudent = (classId, studentNo) => {
    setRecords(prev => ({ ...prev, [classId]: [...(prev[classId]||[]), studentNo] }));
    setPending(prev => ({ ...prev, [classId]: (prev[classId]||[]).filter(s=>s!==studentNo) }));
    showToast("Attendance recorded.");
  };

  const rejectStudent = (classId, studentNo) => {
    setPending(prev => ({ ...prev, [classId]: (prev[classId]||[]).filter(s=>s!==studentNo) }));
    showToast("Attendance request rejected.");
  };

  const startTodaysClasses = () => {
    if (myCourses.length===0) return showToast("No courses yet. Add a class session first.", "error");
    const targetDate = selectedDate;
    const alreadyStarted = myCourses.filter(code => (classes||[]).some(c=>c.courseCode===code&&c.date===targetDate&&c.confirmed));
    if (alreadyStarted.length===myCourses.length) return showToast("Classes for this date are already open.", "error");
    const isPast = targetDate < today;
    const newSessions = [];
    myCourses.forEach(code => {
      const exists = (classes||[]).some(c=>c.courseCode===code&&c.date===targetDate);
      if (!exists) {
        const sess = { id: Date.now().toString()+code, courseCode:code, date:targetDate, topic:"", confirmed:true, lecturerId:currentLecturer.id, attendCode:genCode() };
        if (!isPast) sess.expiresAt = Date.now()+signDuration*60*1000;
        newSessions.push(sess);
      } else {
        setClasses(prev => prev.map(c => c.courseCode===code&&c.date===targetDate ? { ...c, confirmed:true, attendCode:c.attendCode||genCode(), ...(!isPast&&!c.expiresAt?{expiresAt:Date.now()+signDuration*60*1000}:{}) } : c));
      }
    });
    if (newSessions.length>0) setClasses(prev=>[...prev,...newSessions]);
    showToast(isPast ? "Past class sessions created — mark attendance manually." : "Classes are open — students can sign in!");
  };

  const changeMyPin = () => {
    if (curPin!==currentLecturer.pin) return showToast("Current PIN is incorrect","error");
    if (!newPin.trim()) return showToast("New PIN cannot be empty","error");
    if (newPin!==confPin) return showToast("New PINs do not match","error");
    if (newPin===curPin) return showToast("New PIN must differ from current","error");
    if (lecturers.find(l=>l.id!==currentLecturer.id&&l.pin===newPin)) return showToast("That PIN is already in use","error");
    const updated={...currentLecturer,pin:newPin};
    setLecturers(prev=>prev.map(l=>l.id===currentLecturer.id?updated:l));
    setCurrentLecturer(updated);
    setCurPin(""); setNewPin(""); setConfPin("");
    showToast("PIN changed successfully!");
  };

  const adminResetPin = () => {
    if (!resetNewPin.trim()) return showToast("New PIN cannot be empty","error");
    if (lecturers.find(l=>l.id!==resetTarget&&l.pin===resetNewPin)) return showToast("That PIN is already in use","error");
    setLecturers(prev=>prev.map(l=>l.id===resetTarget?{...l,pin:resetNewPin}:l));
    setResetTarget(null); setResetNewPin("");
    showToast("PIN reset successfully.");
  };

  const addLecturer = () => {
    if (!nlName.trim()||!nlPin.trim()) return showToast("Name and PIN are required","error");
    if (lecturers.find(l=>l.pin===nlPin.trim())) return showToast("That PIN is already in use","error");
    const lec={id:Date.now().toString(),name:nlName.trim(),pin:nlPin.trim(),courses:nlCourses,isAdmin:false,instrumentInCharge:nlInCharge};
    setLecturers(prev=>[...prev,lec]);
    setNlName(""); setNlPin(""); setNlCourses([]); setNlInCharge(false);
    showToast("Lecturer added successfully.");
  };

  const removeLecturer = (id) => {
    if (id==="admin") return showToast("Cannot remove the admin account","error");
    setLecturers(prev=>prev.filter(l=>l.id!==id));
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
        <Chip label="Students" value={Object.keys(students||{}).length} color="#6366f1" />
        <Chip label="My Classes" value={myConfirmed.length} color="#22c55e" />
        <Chip label="Pending" value={allPending.length} color="#f59e0b" />
      </div>

      {/* Today Banner */}
      <div style={S.todayBanner}>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,color:"#1e3a5f"}}>📅 {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
          <div style={{fontSize:12,color:"#3b82f6",marginTop:2}}>
            {(myCourses||[]).filter(code=>(classes||[]).some(c=>c.courseCode===code&&c.date===today&&c.confirmed)).length} / {(myCourses||[]).length} courses open today
          </div>
          {(classes||[]).filter(c=>(myCourses||[]).includes(c.courseCode)&&c.date===today&&c.confirmed&&c.attendCode).map(c=>(
            <div key={c.id} style={{marginTop:6,display:"inline-flex",alignItems:"center",gap:8,background:"#1e1b4b",border:"1px solid #6366f1",borderRadius:8,padding:"4px 14px",marginRight:8}}>
              <span style={{fontSize:11,color:"#94a3b8"}}>{c.courseCode}:</span>
              <span style={{fontSize:22,fontWeight:800,letterSpacing:5,color:"#a5b4fc"}}>{c.attendCode}</span>
            </div>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:"#64748b"}}>Date:</span>
            <input type="date" style={{...S.select,padding:"4px 8px",fontSize:12}} value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} />
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,color:"#64748b"}}>Window:</span>
            <select style={{...S.select,padding:"4px 8px",fontSize:12}} value={signDuration} onChange={e=>setSignDuration(Number(e.target.value))}>
              {[5,10,15,20,30].map(m=><option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
          <Btn onClick={startTodaysClasses} label={selectedDate<today?"▶ Create Past Session":"▶ Start Classes"} primary small />
        </div>
      </div>

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
                  <div style={{fontWeight:700}}>{student.name}</div>
                  <div style={{fontSize:12,color:"#94a3b8"}}>{student.studentNo}</div>
                  <div style={{fontSize:13,marginTop:4,color:"#cbd5e1"}}>{cls.courseCode} · {cls.date}{cls.topic?" · "+cls.topic:""}</div>
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
            <div style={{fontWeight:700,marginBottom:12,color:"#1e293b"}}>Add New Class Session</div>
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
                <div style={{fontWeight:700}}>{cls.courseCode}</div>
                <div style={{fontSize:13,color:"#94a3b8"}}>{cls.topic||"Class"} · {cls.date}</div>
                <div style={{fontSize:12,marginTop:4}}>
                  {cls.confirmed?<span style={{color:"#22c55e"}}>✓ Confirmed · {(records[cls.id]||[]).length} signed</span>:<span style={{color:"#f59e0b"}}>⏳ Not confirmed yet</span>}
                </div>
                {cls.confirmed&&cls.attendCode&&(
                  <div style={{marginTop:6,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                    <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"#1e1b4b",border:"1px solid #6366f1",borderRadius:8,padding:"4px 12px"}}>
                      <span style={{fontSize:11,color:"#94a3b8"}}>Code:</span>
                      <span style={{fontSize:20,fontWeight:800,letterSpacing:4,color:"#a5b4fc"}}>{cls.attendCode}</span>
                    </div>
                    {cls.expiresAt&&<CountdownBadge expiresAt={cls.expiresAt}/>}
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
                {!cls.confirmed&&<Btn onClick={()=>confirmClass(cls.id)} label="Confirm" primary small />}
                {cls.confirmed&&<Btn onClick={()=>setManualClassId(manualClassId===cls.id?null:cls.id)} label="✏ Mark" small />}
                <Btn onClick={()=>deleteClass(cls.id)} label="🗑" small danger />
              </div>
            </div>
            {/* Manual attendance panel */}
            {manualClassId===cls.id && (
              <div style={{...S.formCard,marginTop:-6,borderTop:"none",borderRadius:"0 0 14px 14px",paddingTop:12}}>
                <div style={{fontWeight:700,color:"#e2e8f0",marginBottom:4,fontSize:13}}>✏ Mark Attendance — {cls.courseCode} · {cls.date}</div>
                <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>Tap a student to toggle Present/Absent. Tap Save when done.</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                  {Object.values(students||{}).map(s => {
                    const present = (records[cls.id]||[]).includes(s.studentNo);
                    return (
                      <div key={s.studentNo} onClick={()=>toggleManualAttendance(cls.id,s.studentNo)}
                        style={{padding:"6px 12px",borderRadius:99,fontSize:12,cursor:"pointer",fontWeight:600,
                          background:present?"#14532d":"#1e293b",
                          color:present?"#86efac":"#64748b",
                          border:`1px solid ${present?"#22c55e":"#1e293b"}`}}>
                        {present?"✓ ":""}{s.name}
                      </div>
                    );
                  })}
                </div>
                {Object.keys(students||{}).length===0&&<div style={{fontSize:12,color:"#475569",marginBottom:10}}>No students registered yet.</div>}
                <div style={{fontSize:12,color:"#94a3b8",marginBottom:10}}>
                  {(records[cls.id]||[]).length} of {Object.keys(students).length} students marked present
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
          {Object.values(students||{}).length===0?<Empty msg="No students registered yet."/>:
            Object.values(students||{}).map(s=>{
              const stats=studentStats(s.studentNo,myCourses);
              let tot=0,att=0; Object.values(stats).forEach(x=>{tot+=x.total;att+=x.attended;});
              const p=pct(att,tot);
              return (
                <div key={s.studentNo} style={{...S.classCard,cursor:"pointer"}} onClick={()=>setSelectedStudent(s)}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700}}>{s.name}</div>
                    <div style={{fontSize:12,color:"#94a3b8"}}>{s.studentNo}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{color:pctColor(p),fontWeight:700,fontSize:18}}>{p}%</div>
                    <div style={{fontSize:11,color:"#64748b"}}>overall</div>
                  </div>
                </div>
              );
            })}
          {selectedStudent&&<StudentModal student={selectedStudent} studentStats={studentStats} courses={myCourses} pct={pct} pctColor={pctColor} onClose={()=>setSelectedStudent(null)}/>}
        </div>
      )}

      {tab==="lecturers"&&isAdmin&&(
        <div style={S.listWrap}>
          <div style={S.formCard}>
            <div style={{fontWeight:700,marginBottom:12,color:"#1e293b"}}>Add New Lecturer</div>
            <Field label="Full Name" value={nlName} onChange={setNlName} placeholder="e.g. Dr. Adaeze Eze" />
            <Field label="PIN" value={nlPin} onChange={setNlPin} placeholder="e.g. 5678" type="password" />
            <div style={{marginBottom:16}}>
              <label style={S.label}>Assign Courses (optional)</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:6}}>
                {courses.map(code=>(
                  <div key={code} onClick={()=>toggleNlCourse(code)} style={{...S.courseChip,...(nlCourses.includes(code)?S.courseChipActive:{})}}>
                    {code}
                  </div>
                ))}
              </div>
              {courses.length===0&&<div style={{fontSize:12,color:"#475569"}}>No courses registered yet.</div>}
            </div>
            <div style={{marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
              <input type="checkbox" id="nlInCharge" checked={nlInCharge||false} onChange={e=>setNlInCharge(e.target.checked)}
                style={{width:16,height:16,accentColor:"#6366f1",cursor:"pointer"}} />
              <label htmlFor="nlInCharge" style={{...S.label,marginBottom:0,cursor:"pointer",color:"#e2e8f0"}}>
                Instrument Store — Lecturer in Charge
              </label>
            </div>
            <Btn onClick={addLecturer} label="Add Lecturer" primary full />
          </div>
          {(lecturers||[]).map(lec=>(
            <div key={lec.id}>
              <div style={S.classCard}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700}}>{lec.name}</div>
                  <div style={{fontSize:12,color:"#94a3b8",marginTop:3}}>
                    {lec.isAdmin?"Admin — all courses":(Array.isArray(lec.courses)?lec.courses.join(", "):"All courses")}
                  </div>
                  {lec.instrumentInCharge&&<span style={{fontSize:10,background:"#14532d",color:"#86efac",borderRadius:99,padding:"2px 8px",marginTop:4,display:"inline-block"}}>🎸 Instrument In Charge</span>}
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                  {!lec.isAdmin&&<>
                    <Btn onClick={()=>{
                      setLecturers(prev=>prev.map(l=>l.id===lec.id?{...l,instrumentInCharge:!l.instrumentInCharge}:l));
                      showToast(lec.instrumentInCharge?"Instrument In Charge role removed.":"Instrument In Charge role assigned.");
                    }} label={lec.instrumentInCharge?"🎸 In Charge":"🎸 Set In Charge"} small />
                    <Btn onClick={()=>{setResetTarget(lec.id===resetTarget?null:lec.id);setResetNewPin("");}} label="Reset PIN" small />
                    <Btn onClick={()=>removeLecturer(lec.id)} label="Remove" small danger />
                  </>}
                  {lec.isAdmin&&<span style={{fontSize:11,color:"#6366f1",fontWeight:700}}>ADMIN</span>}
                </div>
              </div>
              {resetTarget===lec.id&&(
                <div style={{...S.formCard,marginTop:-6,borderTop:"none",borderRadius:"0 0 14px 14px",paddingTop:12}}>
                  <div style={{fontSize:12,color:"#94a3b8",marginBottom:10}}>Set new PIN for <strong style={{color:"#e2e8f0"}}>{lec.name}</strong></div>
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

          {/* Change PIN */}
          <div style={S.formCard}>
            <div style={{fontWeight:700,marginBottom:4,color:"#1e293b"}}>🔑 Change My PIN</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Update your login PIN securely.</div>
            <Field label="Current PIN" value={curPin} onChange={setCurPin} placeholder="Current PIN" type="password" />
            <Field label="New PIN" value={newPin} onChange={setNewPin} placeholder="New PIN" type="password" />
            <Field label="Confirm New PIN" value={confPin} onChange={setConfPin} placeholder="Re-enter new PIN" type="password" />
            <Btn onClick={changeMyPin} label="Update PIN" primary full />
          </div>

          {/* Export */}
          <div style={S.formCard}>
            <div style={{fontWeight:700,marginBottom:4,color:"#1e293b"}}>📥 Export Attendance</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Download records as CSV — opens in Excel.</div>
            <Btn onClick={()=>exportFullRegister({students:students||{},classes:myClasses||[],records:records||{},courses:myCourses||[],confirmedClasses:myConfirmed||[],pct,showToast})} label="Full Register (My Courses)" primary full />
            <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:8}}>
              {(myCourses||[]).map(code=>(
                <Btn key={code} onClick={()=>exportCourseCSV({code,students:students||{},classes:classes||[],records:records||{},confirmedClasses:myConfirmed||[],pct,showToast})} label={code} small />
              ))}
            </div>
          </div>

          {/* Backup & Restore — Admin only */}
          {isAdmin&&(
            <div style={S.formCard}>
              <div style={{fontWeight:700,marginBottom:4,color:"#1e293b"}}>💾 Backup & Restore Data</div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>Download a full backup weekly. Restore if data is ever lost.</div>
              <Btn onClick={()=>{
                try {
                  const backup = { version:"1.0", exportedAt:new Date().toISOString(), school:"Nwafor Orizu College of Education", department:"Music", data:{ students:students||{}, classes:classes||[], records:records||{}, pending:pending||{}, courses:courses||[], lecturers:lecturers||[] }};
                  const blob = new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
                  const url  = URL.createObjectURL(blob);
                  const a    = document.createElement("a");
                  a.href=url; a.download=`AttendTrack_Backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
                  URL.revokeObjectURL(url);
                  showToast("Backup downloaded!");
                } catch(e){ showToast("Backup failed: "+e.message,"error"); }
              }} label="⬇ Download Full Backup" primary full />
              <div style={{marginTop:10}}>
                <div style={{fontSize:12,color:"#64748b",marginBottom:6}}>Restore from backup file:</div>
                <label style={{display:"block",border:"2px dashed #1e293b",borderRadius:10,padding:"12px",textAlign:"center",cursor:"pointer",fontSize:12,color:"#64748b"}}>
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
                        if(d.students)  setStudents(d.students);
                        if(d.classes)   setClasses(d.classes);
                        if(d.records)   setRecords(d.records);
                        if(d.pending)   setPending(d.pending);
                        if(d.courses)   setCourses(d.courses);
                        if(d.lecturers) setLecturers(d.lecturers);
                        showToast("Data restored from backup!");
                      } catch { showToast("Could not read backup file","error"); }
                    };
                    reader.readAsText(file);
                  }} />
                </label>
              </div>
            </div>
          )}

          {/* Course Management — Admin only */}
          {isAdmin&&(
            <div style={S.formCard}>
              <div style={{fontWeight:700,marginBottom:12,color:"#1e293b"}}>Course Management</div>
              <div style={{display:"flex",gap:8}}>
                <input style={{...S.input,flex:1}} placeholder="New course code e.g. MUS 310" value={newCourse} onChange={e=>setNewCourse(e.target.value)} />
                <Btn onClick={()=>{
                  if(!newCourse.trim()) return;
                  const list = courses||[];
                  if(list.includes(newCourse.trim())) return showToast("Course already exists","error");
                  setCourses([...list, newCourse.trim()]); setNewCourse(""); showToast("Course added.");
                }} label="Add" primary small />
              </div>
              <div style={{marginTop:16}}>
                {(courses||[]).map(c=>(
                  <div key={c} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1e293b"}}>
                    <span style={{color:"#e2e8f0"}}>{c}</span>
                    <span style={{fontSize:12,color:"#ef4444",cursor:"pointer"}} onClick={()=>setCourses((courses||[]).filter(x=>x!==c))}>Remove</span>
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
  const header=["Student Name","Student Number"]; courses.forEach(code=>header.push(code+" Attended",code+" Total",code+" %")); header.push("Overall Attended","Overall Total","Overall %","Status");
  const rows=[header];
  list.forEach(s=>{
    const row=[s.name,s.studentNo]; let ta=0,tc=0;
    courses.forEach(code=>{ const cls=confirmedClasses.filter(c=>c.courseCode===code); const att=cls.filter(c=>(records[c.id]||[]).includes(s.studentNo)).length; ta+=att;tc+=cls.length; row.push(att,cls.length,pct(att,cls.length)+"%"); });
    const op=pct(ta,tc); row.push(ta,tc,op+"%",op>=75?"Satisfactory":"Below 75%"); rows.push(row);
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
  list.forEach(s=>{ const row=[s.name,s.studentNo]; let att=0; cls.forEach(c=>{ const p=(records[c.id]||[]).includes(s.studentNo); row.push(p?"P":"A"); if(p)att++; }); const p=pct(att,cls.length); row.push(att,cls.length,p+"%",p>=75?"Satisfactory":"Below 75%"); rows.push(row); });
  downloadCSV(`AttendTrack_${code.replace(" ","")}_${new Date().toISOString().slice(0,10)}.csv`,rows);
  showToast(code+" register exported!");
}

// ── Student Modal ─────────────────────────────────────────────────────────────
function StudentModal({ student, studentStats, courses, pct, pctColor, onClose }) {
  const stats=studentStats(student.studentNo,courses);
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div>
            <div style={{fontWeight:700,fontSize:17,color:"#f1f5f9"}}>{student.name}</div>
            <div style={{fontSize:13,color:"#64748b"}}>{student.studentNo}</div>
          </div>
          <span style={{cursor:"pointer",fontSize:20,color:"#64748b"}} onClick={onClose}>✕</span>
        </div>
        {courses.map(code=>{ const s=stats[code]; const p=pct(s.attended,s.total); return (
          <div key={code} style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:14,color:"#cbd5e1"}}>{code}</span><span style={{color:pctColor(p),fontWeight:700}}>{p}%</span></div>
            <div style={S.barBg}><div style={{...S.barFill,width:p+"%",background:pctColor(p)}}/></div>
            <div style={{fontSize:11,color:"#64748b"}}>{s.attended}/{s.total} classes</div>
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
function BackBtn({ onClick }) { return <div onClick={onClick} style={{cursor:"pointer",color:"#6366f1",fontSize:13,marginBottom:16}}>← Back</div>; }
function Empty({ msg }) { return <div style={{textAlign:"center",color:"#475569",padding:"40px 0",fontSize:14}}>{msg}</div>; }
function Chip({ label, value, color }) {
  return <div style={{...S.chip,borderColor:color}}><div style={{fontSize:22,fontWeight:800,color}}>{value}</div><div style={{fontSize:11,color:"#64748b",marginTop:2}}>{label}</div></div>;
}
function Ring({ pct:p, size=60 }) {
  const r=size/2-6,circ=2*Math.PI*r,offset=circ-(p/100)*circ,col=p>=75?"#22c55e":p>=50?"#f59e0b":"#ef4444";
  return <svg width={size} height={size} style={{flexShrink:0}}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={7}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={7} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/><text x="50%" y="54%" textAnchor="middle" fill={col} fontSize={size*0.22} fontWeight="700">{p}%</text></svg>;
}

// ── Inventory Dashboard ───────────────────────────────────────────────────────
function InventoryDash({ instruments, setInstruments, loans, setLoans, studentInstruments, students, lecturers, currentLecturer, setCurrentLecturer, setView, showToast, isAdmin }) {
  const [lecPin, setLecPin]         = useState("");
  const [invSno, setInvSno]         = useState("");
  const [invRole, setInvRole]       = useState(null); // "student" | "lecturer"
  const [invStudent, setInvStudent] = useState(null);
  const [tab, setTab]               = useState("inventory");
  const [showAddInst, setShowAddInst] = useState(false);
  const [newInst, setNewInst]       = useState({ name:"", type:"", serialNo:"", quantity:1, condition:"Good", location:"" });
  const [requestInstId, setRequestInstId] = useState(null);
  const [requestNote, setRequestNote] = useState("");
  const [damageNote, setDamageNote] = useState({});
  const [returnNote, setReturnNote] = useState({});

  const CONDITIONS = ["Good","Fair","Poor","Under Repair","Damaged"];
  const TYPES      = ["String","Wind","Keyboard","Percussion","Vocal","Other"];

  // ── Entry screen — role selection ──────────────────────────────────────────
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

  // ── Student entry ────────────────────────────────────────────────────────────
  if (!currentLecturer && invRole === "student" && !invStudent) {
    const [invPwd, setInvPwd] = useState("");
    const [invFoundStudent, setInvFoundStudent] = useState(null);
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
              setInvStudent(invFoundStudent);
              showToast("Welcome, " + invFoundStudent.name.split(" ")[0]);
            }
          }} label={invFoundStudent?"Enter Store":"Continue"} primary full />
        </div>
      </div>
    );
  }

  // ── Lecturer entry ────────────────────────────────────────────────────────────
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

  // ── Student view (read + request) ────────────────────────────────────────────
  if (invStudent && !currentLecturer) {
    const activeLoansAll = (loans||[]).filter(l=>l.status==="active");
    const condColor = (c) => c==="Good"?"#22c55e":c==="Fair"?"#f59e0b":"#ef4444";
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

        {/* Student tabs */}
        <div style={{...S.tabs,flexWrap:"wrap"}}>
          {[["store","🏛 Store Room"],["holdings","🎓 Student Holdings"],["myloans","📋 My Requests"]].map(([t,l])=>(
            <div key={t} style={{...S.tab,...(tab===t?S.tabActive:{})}} onClick={()=>setTab(t)}>
              {l}
            </div>
          ))}
        </div>

        {/* Store Room — browse and request */}
        {tab==="store" && (
          <div style={S.listWrap}>
            <div style={{...S.sectionHeader,background:"linear-gradient(135deg,#1e1b4b,#1e293b)",borderColor:"#3730a3",marginBottom:16}}>
              <div style={{fontWeight:700,color:"#a5b4fc",fontSize:13}}>🏛 Department Store Room</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Browse available instruments and request to borrow</div>
            </div>
            {(instruments||[]).length===0
              ? <Empty msg="No instruments in the store room yet." />
              : (instruments||[]).map(inst=>{
                const onLoan=activeLoansAll.filter(l=>l.instId===inst.id).length;
                const available=Math.max(0,inst.quantity-onLoan);
                const myLoan=(loans||[]).find(l=>l.instId===inst.id&&l.borrowerId===invStudent.studentNo&&l.status==="active");
                const myPending=(loans||[]).find(l=>l.instId===inst.id&&l.borrowerId===invStudent.studentNo&&l.status==="pending");
                return (
                  <div key={inst.id} style={S.formCard}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div>
                        <div style={{fontWeight:700,fontSize:14,color:"#e2e8f0"}}>{inst.name}</div>
                        <div style={{fontSize:12,color:"#64748b"}}>{inst.type}</div>
                      </div>
                      <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,
                        background:condColor(inst.condition)+"22",color:condColor(inst.condition)}}>
                        {inst.condition}
                      </span>
                    </div>
                    <div style={{fontSize:12,marginBottom:8,fontWeight:600,color:available>0?"#22c55e":"#ef4444"}}>
                      {available>0?`${available} available`:"Currently unavailable"}
                    </div>
                    {myLoan&&<div style={{fontSize:12,color:"#f59e0b",marginBottom:6}}>✓ You currently have this instrument</div>}
                    {myPending&&<div style={{fontSize:12,color:"#6366f1",marginBottom:6}}>⏳ Your request is pending approval</div>}
                    {!myLoan&&!myPending&&available>0&&(
                      requestInstId===inst.id
                        ? <div>
                            <input style={{...S.input,marginBottom:8,fontSize:13}}
                              placeholder="Why do you need this instrument?"
                              value={requestNote} onChange={e=>setRequestNote(e.target.value)} />
                            <div style={{display:"flex",gap:6}}>
                              <Btn onClick={()=>{
                                if(!requestNote.trim())return showToast("Please describe your purpose","error");
                                const loan={id:Date.now().toString(),instId:inst.id,borrowerName:invStudent.name,
                                  borrowerId:invStudent.studentNo,borrowerType:"student",purpose:requestNote.trim(),
                                  status:"pending",requestedAt:new Date().toISOString(),damageReports:[]};
                                setLoans(prev=>[...(prev||[]),loan]);
                                setRequestInstId(null); setRequestNote("");
                                showToast("Request submitted — awaiting lecturer approval.");
                              }} label="Submit Request" primary small />
                              <Btn onClick={()=>{setRequestInstId(null);setRequestNote("");}} label="Cancel" small />
                            </div>
                          </div>
                        : <Btn onClick={()=>setRequestInstId(inst.id)} label="📤 Request to Borrow" small />
                    )}
                  </div>
                );
              })
            }
          </div>
        )}

        {/* Student Holdings */}
        {tab==="holdings" && (
          <div style={S.listWrap}>
            <div style={{...S.sectionHeader,background:"linear-gradient(135deg,#14532d,#1e293b)",borderColor:"#22c55e",marginBottom:16}}>
              <div style={{fontWeight:700,color:"#86efac",fontSize:13}}>🎓 Instruments With Students</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Department instruments declared by students</div>
            </div>
            {(studentInstruments||[]).length===0
              ? <Empty msg="No students have declared instruments yet." />
              : (studentInstruments||[]).map(inst=>{
                const isMe=inst.studentNo===invStudent.studentNo;
                return (
                  <div key={inst.id} style={{...S.classCard,borderColor:isMe?"#6366f1":"#1e293b"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:isMe?"#a5b4fc":"#e2e8f0"}}>{inst.name}</div>
                      <div style={{fontSize:12,color:"#64748b"}}>{inst.type}</div>
                      <div style={{fontSize:12,color:isMe?"#6366f1":"#94a3b8",marginTop:2}}>
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

        {/* My Requests */}
        {tab==="myloans" && (
          <div style={S.listWrap}>
            {(loans||[]).filter(l=>l.borrowerId===invStudent.studentNo).length===0
              ? <Empty msg="You have no instrument requests yet." />
              : [...(loans||[])].filter(l=>l.borrowerId===invStudent.studentNo).reverse().map(loan=>{
                const inst=(instruments||[]).find(i=>i.id===loan.instId);
                const statusColor=loan.status==="active"?"#f59e0b":loan.status==="pending"?"#6366f1":loan.status==="returned"?"#22c55e":"#ef4444";
                return (
                  <div key={loan.id} style={S.classCard}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,color:"#e2e8f0"}}>{inst?.name||"Unknown"}</div>
                      <div style={{fontSize:12,color:"#64748b"}}>{loan.purpose}</div>
                      <div style={{fontSize:11,color:"#475569"}}>{new Date(loan.requestedAt).toLocaleDateString()}</div>
                      {(loan.damageReports||[]).length>0&&(
                        <div style={{fontSize:11,color:"#ef4444",marginTop:2}}>⚠ {loan.damageReports.length} damage report{loan.damageReports.length>1?"s":""}</div>
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
      </div>
    );
  }

  const isLecturerAdmin = currentLecturer.isAdmin || currentLecturer.courses==="__all__" || currentLecturer.instrumentInCharge===true;

  const addInstrument = () => {
    if (!newInst.name.trim()) return showToast("Instrument name is required","error");
    const inst = { id: Date.now().toString(), ...newInst, quantity: Number(newInst.quantity), addedAt: new Date().toISOString(), damageHistory:[] };
    setInstruments(prev => [...(prev||[]), inst]);
    setNewInst({ name:"", type:"", serialNo:"", quantity:1, condition:"Good", location:"" });
    setShowAddInst(false);
    showToast("Instrument added to inventory.");
  };

  const updateCondition = (id, condition) => {
    setInstruments(prev => (prev||[]).map(i => i.id===id ? {...i, condition} : i));
    showToast("Condition updated.");
  };

  const deleteInstrument = (id) => {
    setInstruments(prev => (prev||[]).filter(i => i.id!==id));
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
    setLoans(prev => [...(prev||[]), loan]);
    setRequestInstId(null); setRequestNote("");
    showToast("Request submitted — waiting for approval.");
  };

  const approveLoan = (loanId) => {
    setLoans(prev => (prev||[]).map(l => l.id===loanId ? {...l, status:"active", approvedAt:new Date().toISOString(), approvedBy:currentLecturer.name} : l));
    showToast("Loan approved — instrument signed out.");
  };

  const rejectLoan = (loanId) => {
    setLoans(prev => (prev||[]).map(l => l.id===loanId ? {...l, status:"rejected"} : l));
    showToast("Request rejected.");
  };

  const returnInstrument = (loanId) => {
    const note = returnNote[loanId]||"";
    setLoans(prev => (prev||[]).map(l => l.id===loanId ? {...l, status:"returned", returnedAt:new Date().toISOString(), returnNote:note} : l));
    setReturnNote(prev => { const n={...prev}; delete n[loanId]; return n; });
    showToast("Instrument returned and recorded.");
  };

  const reportDamage = (loanId, reporter) => {
    const note = damageNote[loanId]||"";
    if (!note.trim()) return showToast("Please describe the damage","error");
    setLoans(prev => (prev||[]).map(l => l.id===loanId ? {
      ...l,
      damageReports: [...(l.damageReports||[]), { note, reporter, reportedAt:new Date().toISOString() }]
    } : l));
    setDamageNote(prev => { const n={...prev}; delete n[loanId]; return n; });
    showToast("Damage report recorded.");
  };

  const pendingLoans  = (loans||[]).filter(l=>l.status==="pending");
  const activeLoans   = (loans||[]).filter(l=>l.status==="active");
  const returnedLoans = (loans||[]).filter(l=>l.status==="returned"||l.status==="rejected");

  const getInst = (id) => (instruments||[]).find(i=>i.id===id);

  const condColor = (c) => c==="Good"?"#22c55e":c==="Fair"?"#f59e0b":c==="Poor"?"#ef4444":c==="Under Repair"?"#6366f1":"#ef4444";

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerInner}>
          <div>
            <div style={S.headerTitle}>Instrument Store</div>
            <div style={S.headerSub}>NOCEN Music Dept · {currentLecturer.name}
              {isLecturerAdmin&&<span style={{marginLeft:6,fontSize:10,background:"rgba(255,255,255,0.2)",color:"#fff",borderRadius:99,padding:"2px 6px"}}>In Charge</span>}
              {!isLecturerAdmin&&<span style={{marginLeft:6,fontSize:10,background:"rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.6)",borderRadius:99,padding:"2px 6px"}}>View Only</span>}
            </div>
          </div>
          <Btn onClick={()=>{setCurrentLecturer(null);setView("splash");}} label="Sign Out" small />
        </div>
      </div>

      {/* Summary chips */}
      <div style={S.chips}>
        <Chip label="In Store" value={(instruments||[]).reduce((a,i)=>a+Number(i.quantity||1),0)} color="#6366f1" />
        <Chip label="With Students" value={(studentInstruments||[]).length} color="#22c55e" />
        <Chip label="On Loan" value={activeLoans.length} color="#f59e0b" />
      </div>

      {/* Tabs */}
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

      {/* ── INVENTORY TAB ── */}
      {tab==="inventory" && (
        <div style={S.listWrap}>

          {/* Pending loan requests */}
          {pendingLoans.length>0&&isLecturerAdmin&&(
            <div style={{...S.formCard,borderColor:"#f59e0b",marginBottom:16}}>
              <div style={{fontWeight:700,color:"#f59e0b",marginBottom:8}}>⏳ {pendingLoans.length} Pending Loan Request{pendingLoans.length>1?"s":""}</div>
              {pendingLoans.map(loan=>{
                const inst=getInst(loan.instId);
                return (
                  <div key={loan.id} style={{borderBottom:"1px solid #1e293b",paddingBottom:10,marginBottom:10}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0"}}>{loan.borrowerName}</div>
                    <div style={{fontSize:12,color:"#94a3b8"}}>wants: {inst?.name||"Unknown"} · {loan.purpose}</div>
                    <div style={{display:"flex",gap:6,marginTop:6}}>
                      <Btn onClick={()=>approveLoan(loan.id)} label="✓ Approve" primary small />
                      <Btn onClick={()=>rejectLoan(loan.id)} label="✗ Reject" small danger />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SECTION A: DEPARTMENT STORE ── */}
          <div style={{...S.sectionHeader, background:"linear-gradient(135deg,#1e1b4b,#1e293b)", borderColor:"#3730a3"}}>
            <div style={{fontWeight:700,color:"#a5b4fc",fontSize:13}}>🏛 Department Store Room</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Instruments physically in the department — entered by lecturer in charge</div>
          </div>

          {(instruments||[]).length===0
            ? <div style={{textAlign:"center",color:"#475569",padding:"20px 0",fontSize:13}}>
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
                      <div style={{fontWeight:700,fontSize:15,color:"#e2e8f0"}}>{inst.name}</div>
                      <div style={{fontSize:12,color:"#64748b"}}>{inst.type}{inst.serialNo?" · S/N: "+inst.serialNo:""}</div>
                      {inst.location&&<div style={{fontSize:12,color:"#64748b"}}>📍 {inst.location}</div>}
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,
                      background:condColor(inst.condition)+"22",color:condColor(inst.condition)}}>
                      {inst.condition}
                    </span>
                  </div>
                  <div style={{display:"flex",gap:16,marginBottom:10,flexWrap:"wrap"}}>
                    <div style={{fontSize:12,color:"#94a3b8"}}>Qty: <b style={{color:"#e2e8f0"}}>{inst.quantity}</b></div>
                    <div style={{fontSize:12,color:"#94a3b8"}}>On loan: <b style={{color:"#f59e0b"}}>{onLoan}</b></div>
                    <div style={{fontSize:12,color:"#94a3b8"}}>Available: <b style={{color:available>0?"#22c55e":"#ef4444"}}>{available}</b></div>
                  </div>
                  {isLecturerAdmin&&(
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                      <select style={{...S.select,padding:"4px 8px",fontSize:12}} value={inst.condition}
                        onChange={e=>updateCondition(inst.id,e.target.value)}>
                        {CONDITIONS.map(c=><option key={c}>{c}</option>)}
                      </select>
                      <Btn onClick={()=>deleteInstrument(inst.id)} label="🗑 Remove" small danger />
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
                  {available===0&&<div style={{fontSize:12,color:"#ef4444",marginTop:4}}>All units currently on loan</div>}
                </div>
              );
            })
          }

          {/* ── SECTION B: INSTRUMENTS WITH STUDENTS ── */}
          <div style={{...S.sectionHeader, background:"linear-gradient(135deg,#14532d,#1e293b)", borderColor:"#22c55e", marginTop:16}}>
            <div style={{fontWeight:700,color:"#86efac",fontSize:13}}>🎓 Instruments With Students</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Declared by students — department-issued instruments in student possession</div>
          </div>

          {(studentInstruments||[]).length===0
            ? <div style={{textAlign:"center",color:"#475569",padding:"20px 0",fontSize:13}}>No students have declared instruments yet.</div>
            : (studentInstruments||[]).map(inst=>(
              <div key={inst.id} style={{...S.classCard}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,color:"#e2e8f0"}}>{inst.name}</div>
                  <div style={{fontSize:12,color:"#94a3b8"}}>{inst.type}{inst.serialNo?" · S/N: "+inst.serialNo:""}</div>
                  <div style={{fontSize:12,color:"#6366f1",marginTop:2}}>👤 {inst.studentName} · {inst.studentNo}</div>
                  {(inst.damageReports||[]).length>0&&(
                    <div style={{fontSize:11,color:"#ef4444",marginTop:2}}>⚠ {inst.damageReports.length} damage report{inst.damageReports.length>1?"s":""}</div>
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

      {/* ── ACTIVE LOANS TAB ── */}
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
                      <div style={{fontWeight:700,color:"#e2e8f0"}}>{inst?.name||"Unknown"}</div>
                      <div style={{fontSize:12,color:"#94a3b8"}}>Borrowed by: {loan.borrowerName}</div>
                      <div style={{fontSize:12,color:"#64748b"}}>Purpose: {loan.purpose}</div>
                      <div style={{fontSize:11,color:"#475569"}}>Since: {new Date(loan.approvedAt).toLocaleDateString()}</div>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,background:"#f59e0b22",color:"#f59e0b"}}>On Loan</span>
                  </div>

                  {/* Damage reports */}
                  {(loan.damageReports||[]).length>0&&(
                    <div style={{marginTop:8,background:"#7f1d1d22",borderRadius:8,padding:"8px 10px"}}>
                      <div style={{fontSize:11,color:"#ef4444",fontWeight:700,marginBottom:4}}>⚠ Damage Reports</div>
                      {loan.damageReports.map((r,i)=>(
                        <div key={i} style={{fontSize:12,color:"#fca5a5",marginBottom:2}}>{r.reporter}: {r.note}</div>
                      ))}
                    </div>
                  )}

                  {/* Report damage — borrower or admin */}
                  {(isMyLoan||isLecturerAdmin)&&(
                    <div style={{marginTop:8}}>
                      <input style={{...S.input,marginBottom:6,fontSize:12}} placeholder="Report damage (describe issue)..."
                        value={damageNote[loan.id]||""}
                        onChange={e=>setDamageNote(prev=>({...prev,[loan.id]:e.target.value}))} />
                      <Btn onClick={()=>reportDamage(loan.id, currentLecturer.name)} label="⚠ Report Damage" small danger />
                    </div>
                  )}

                  {/* Return — admin only */}
                  {isLecturerAdmin&&(
                    <div style={{marginTop:8,borderTop:"1px solid #1e293b",paddingTop:8}}>
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

      {/* ── HISTORY TAB ── */}
      {tab==="history" && (
        <div style={S.listWrap}>
          {returnedLoans.length===0?<Empty msg="No returned or rejected loans yet."/>:
            [...returnedLoans].reverse().map(loan=>{
              const inst=getInst(loan.instId);
              return (
                <div key={loan.id} style={{...S.classCard,flexDirection:"column",alignItems:"flex-start"}}>
                  <div style={{display:"flex",justifyContent:"space-between",width:"100%"}}>
                    <div>
                      <div style={{fontWeight:700,color:"#e2e8f0"}}>{inst?.name||"Unknown"}</div>
                      <div style={{fontSize:12,color:"#94a3b8"}}>{loan.borrowerName} · {loan.purpose}</div>
                      <div style={{fontSize:11,color:"#475569"}}>
                        {loan.status==="returned"
                          ? `Returned: ${new Date(loan.returnedAt).toLocaleDateString()}`
                          : "Rejected"}
                      </div>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,
                      background:loan.status==="returned"?"#14532d22":"#7f1d1d22",
                      color:loan.status==="returned"?"#22c55e":"#ef4444"}}>
                      {loan.status==="returned"?"Returned":"Rejected"}
                    </span>
                  </div>
                  {(loan.damageReports||[]).length>0&&(
                    <div style={{marginTop:6,fontSize:12,color:"#ef4444"}}>
                      ⚠ {loan.damageReports.length} damage report{loan.damageReports.length>1?"s":""}
                    </div>
                  )}
                  {loan.returnNote&&<div style={{fontSize:12,color:"#64748b",marginTop:4}}>Note: {loan.returnNote}</div>}
                </div>
              );
            })
          }
        </div>
      )}

      {/* ── STUDENT RECORDS TAB ── */}
      {tab==="students"&&(
        <div style={S.listWrap}>
          {(studentInstruments||[]).length===0
            ? <Empty msg="No students have registered instruments yet."/>
            : <>
                {/* Summary by type */}
                <div style={S.formCard}>
                  <div style={{fontWeight:700,color:"#e2e8f0",marginBottom:10}}>Department Instrument Summary</div>
                  {["String","Wind","Keyboard","Percussion","Vocal","Other"].map(type=>{
                    const count=(studentInstruments||[]).filter(i=>i.type===type).length;
                    if(!count) return null;
                    return <div key={type} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #1e293b",fontSize:13}}>
                      <span style={{color:"#cbd5e1"}}>{type}</span>
                      <span style={{color:"#6366f1",fontWeight:700}}>{count}</span>
                    </div>;
                  })}
                  <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",fontSize:13,fontWeight:700}}>
                    <span style={{color:"#e2e8f0"}}>Total</span>
                    <span style={{color:"#22c55e"}}>{(studentInstruments||[]).length}</span>
                  </div>
                </div>
                {/* Export button */}
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
                {/* Individual records */}
                {[...(studentInstruments||[])].sort((a,b)=>a.studentName.localeCompare(b.studentName)).map(inst=>{
                  const condColor=(c)=>c==="Good"?"#22c55e":c==="Fair"?"#f59e0b":"#ef4444";
                  return (
                    <div key={inst.id} style={S.classCard}>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:700}}>{inst.studentName}</div>
                        <div style={{fontSize:12,color:"#94a3b8"}}>{inst.studentNo}</div>
                        <div style={{fontSize:13,color:"#cbd5e1",marginTop:4}}>{inst.name} · {inst.type}</div>
                        {inst.serialNo&&<div style={{fontSize:11,color:"#475569"}}>S/N: {inst.serialNo}</div>}
                        {(inst.damageReports||[]).length>0&&<div style={{fontSize:11,color:"#ef4444",marginTop:2}}>⚠ {inst.damageReports.length} damage report{inst.damageReports.length>1?"s":""}</div>}
                      </div>
                      <span style={{fontSize:11,fontWeight:700,padding:"3px 10px",borderRadius:99,
                        background:condColor(inst.condition)+"22",color:condColor(inst.condition),flexShrink:0}}>
                        {inst.condition}
                      </span>
                    </div>
                  );
                })}
              </>
          }
        </div>
      )}

      {/* ── ADD INSTRUMENT TAB (admin only) ── */}
      {tab==="add"&&isLecturerAdmin&&(
        <div style={S.listWrap}>
          <div style={S.formCard}>
            <div style={{fontWeight:700,marginBottom:12,color:"#1e293b"}}>Add Instrument to Inventory</div>
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
  root:{ minHeight:"100vh",background:"#f0f4ff",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#1e293b",position:"relative",overflowX:"hidden" },
  grain:{ display:"none" },
  center:{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:16,position:"relative",zIndex:1,background:"linear-gradient(135deg,#e0e7ff 0%,#f0f9ff 50%,#dbeafe 100%)" },
  splashCard:{ background:"#ffffff",borderRadius:28,padding:48,textAlign:"center",maxWidth:400,width:"100%",boxShadow:"0 20px 60px rgba(59,130,246,0.15),0 4px 16px rgba(0,0,0,0.08)" },
  logo:{ fontSize:52,marginBottom:12 },
  logoCrest:{ width:100,height:100,borderRadius:"50%",background:"#f8faff",border:"3px solid #2563eb",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",boxShadow:"0 4px 20px rgba(37,99,235,0.25)",overflow:"hidden",padding:4 },
  schoolName:{ fontSize:13,fontWeight:700,color:"#1d4ed8",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2 },
  deptName:{ fontSize:11,color:"#2563eb",marginBottom:16,opacity:0.7 },
  copyright:{ marginTop:24,fontSize:11,color:"#94a3b8",borderTop:"1px solid #e2e8f0",paddingTop:12 },
  splashTitle:{ margin:0,fontSize:34,fontWeight:800,letterSpacing:"-1px",background:"linear-gradient(135deg,#1d4ed8,#0ea5e9)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" },
  splashSub:{ color:"#64748b",marginTop:8,fontSize:14 },
  card:{ background:"#ffffff",borderRadius:20,padding:32,maxWidth:420,width:"100%",boxShadow:"0 8px 32px rgba(59,130,246,0.12),0 2px 8px rgba(0,0,0,0.06)" },
  cardTitle:{ margin:"0 0 6px",fontSize:22,fontWeight:700,color:"#1e293b" },
  cardSub:{ color:"#64748b",fontSize:13,marginBottom:24 },
  page:{ maxWidth:620,margin:"0 auto",padding:"0 0 40px",position:"relative",zIndex:1 },
  header:{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0",marginBottom:0,background:"linear-gradient(135deg,#1d4ed8,#0284c7)",color:"#fff" },
  headerInner:{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px",width:"100%",marginBottom:20 },
  headerTitle:{ fontSize:20,fontWeight:800,color:"#ffffff" },
  headerSub:{ fontSize:12,color:"rgba(255,255,255,0.75)" },
  overallBar:{ display:"flex",alignItems:"center",background:"#ffffff",borderRadius:16,padding:"16px 20px",margin:"0 16px 20px",boxShadow:"0 2px 12px rgba(59,130,246,0.1)" },
  tabs:{ display:"flex",gap:4,padding:"0 16px",marginBottom:12,overflowX:"auto" },
  tab:{ padding:"8px 16px",borderRadius:10,fontSize:13,cursor:"pointer",color:"#64748b",background:"transparent",userSelect:"none",position:"relative",whiteSpace:"nowrap",fontWeight:500 },
  tabActive:{ background:"#1d4ed8",color:"#ffffff",fontWeight:700,boxShadow:"0 2px 8px rgba(29,78,216,0.3)" },
  listWrap:{ padding:"0 16px" },
  classCard:{ display:"flex",alignItems:"center",gap:12,background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:14,padding:"14px 16px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.05)" },
  courseCard:{ background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:14,padding:"14px 16px",marginBottom:10,boxShadow:"0 1px 4px rgba(0,0,0,0.05)" },
  formCard:{ background:"#ffffff",border:"1px solid #e2e8f0",borderRadius:14,padding:18,marginBottom:16,boxShadow:"0 1px 4px rgba(0,0,0,0.05)" },
  barBg:{ height:7,background:"#e2e8f0",borderRadius:99,overflow:"hidden",marginTop:6 },
  barFill:{ height:"100%",borderRadius:99,transition:"width .4s ease" },
  btn:{ border:"none",borderRadius:10,padding:"10px 20px",fontSize:14,fontWeight:600,cursor:"pointer",transition:"all .15s",display:"inline-flex",alignItems:"center",justifyContent:"center" },
  btnPrimary:{ background:"linear-gradient(135deg,#1d4ed8,#0284c7)",color:"#fff",boxShadow:"0 2px 8px rgba(29,78,216,0.3)" },
  btnSecondary:{ background:"#f1f5f9",color:"#475569",border:"1px solid #e2e8f0" },
  btnDanger:{ background:"#fee2e2",color:"#dc2626",border:"1px solid #fecaca" },
  label:{ display:"block",fontSize:12,color:"#64748b",marginBottom:6,fontWeight:500 },
  input:{ width:"100%",boxSizing:"border-box",background:"#f8faff",border:"1.5px solid #dbeafe",borderRadius:10,padding:"10px 14px",color:"#1e293b",fontSize:14,outline:"none" },
  select:{ background:"#f8faff",border:"1.5px solid #dbeafe",borderRadius:10,padding:"10px 14px",color:"#1e293b",fontSize:13,outline:"none" },
  badge:{ display:"inline-block",fontSize:10,background:"#fef3c7",color:"#d97706",borderRadius:99,padding:"2px 8px",marginTop:4,fontWeight:600 },
  badge2:{ display:"inline-block",background:"#dc2626",color:"#fff",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 6px",marginLeft:6 },
  chips:{ display:"flex",gap:10,padding:"0 16px",marginBottom:20 },
  chip:{ flex:1,background:"#ffffff",border:"2px solid",borderRadius:14,padding:"12px 16px",textAlign:"center",boxShadow:"0 1px 4px rgba(0,0,0,0.05)" },
  overlay:{ position:"fixed",inset:0,background:"rgba(30,41,59,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 },
  modal:{ background:"#ffffff",borderRadius:20,padding:24,width:"100%",maxWidth:400,boxShadow:"0 20px 60px rgba(0,0,0,0.2)" },
  toast:{ position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",padding:"10px 24px",borderRadius:12,color:"#fff",fontSize:13,fontWeight:600,zIndex:200,boxShadow:"0 8px 24px rgba(0,0,0,.2)" },
  courseChip:{ padding:"6px 14px",borderRadius:99,fontSize:12,cursor:"pointer",background:"#f1f5f9",color:"#64748b",border:"1.5px solid #e2e8f0",fontWeight:500 },
  courseChipActive:{ background:"#dbeafe",color:"#1d4ed8",border:"1.5px solid #1d4ed8",fontWeight:700 },
  todayBanner:{ display:"flex",alignItems:"center",gap:12,background:"linear-gradient(135deg,#dbeafe,#e0f2fe)",border:"1.5px solid #93c5fd",borderRadius:14,padding:"14px 16px",margin:"0 16px 16px" },
  codeInput:{ width:120,background:"#f0f9ff",border:"2.5px solid #1d4ed8",borderRadius:8,padding:"8px 10px",color:"#1d4ed8",fontSize:20,fontWeight:800,letterSpacing:6,textAlign:"center",outline:"none" },
  sectionHeader:{ border:"1.5px solid",borderRadius:12,padding:"12px 16px",marginBottom:12 },
};
