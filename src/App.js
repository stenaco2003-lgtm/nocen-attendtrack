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

  // Load from Firestore on mount — NEVER overwrite Firebase data with defaults
  useEffect(() => {
    (async () => {
      const s  = await fbGet("attendtrack/students");  setStudents(s  ?? {});
      const c  = await fbGet("attendtrack/classes");   setClasses(c   ?? []);
      const r  = await fbGet("attendtrack/records");   setRecords(r   ?? {});
      const p  = await fbGet("attendtrack/pending");   setPending(p   ?? {});
      const co = await fbGet("attendtrack/courses");   setCourses(co  ?? []);
      const lc = await fbGet("attendtrack/lecturers"); setLecturers(lc ?? DEFAULT_LECTURERS);
      setLoading(false);
    })();
  }, []);

  // Save to Firestore — only after loading is complete AND value is not null
  useEffect(() => { if (!loading && students  !== null) fbSet("attendtrack/students",  students);  }, [students,  loading]);
  useEffect(() => { if (!loading && classes   !== null) fbSet("attendtrack/classes",   classes);   }, [classes,   loading]);
  useEffect(() => { if (!loading && records   !== null) fbSet("attendtrack/records",   records);   }, [records,   loading]);
  useEffect(() => { if (!loading && pending   !== null) fbSet("attendtrack/pending",   pending);   }, [pending,   loading]);
  useEffect(() => { if (!loading && courses   !== null) fbSet("attendtrack/courses",   courses);   }, [courses,   loading]);
  useEffect(() => { if (!loading && lecturers !== null) fbSet("attendtrack/lecturers", lecturers); }, [lecturers, loading]);

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
      <div style={{color:"#6366f1", fontSize:14}}>Loading AttendTrack...</div>
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
      {view === "sign-in"  && <SignInStudent students={students} setView={setView} showToast={showToast} setCurrentStudent={setCurrentStudent} />}
      {view === "student"  && currentStudent && (
        <StudentDash student={currentStudent} classes={classes} confirmedClasses={confirmedClasses}
          records={records} pending={pending} setPending={setPending} courses={courses}
          studentStats={studentStats} setView={setView} showToast={showToast} pct={pct} pctColor={pctColor} />
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
        </div>
        <div style={S.copyright}>© Nwafor Orizu College of Education 2026</div>
      </div>
    </div>
  );
}

// ── Register ──────────────────────────────────────────────────────────────────
function Register({ students, setStudents, setView, showToast, setCurrentStudent }) {
  const [name, setName] = useState("");
  const [sno, setSno]   = useState("");
  const submit = () => {
    if (!name.trim() || !sno.trim()) return showToast("Please fill all fields", "error");
    if (students[sno.trim()]) return showToast("Student number already registered", "error");
    const student = { name: name.trim(), studentNo: sno.trim() };
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
        <Btn onClick={submit} label="Register & Continue" primary full />
      </div>
    </div>
  );
}

// ── Sign In Student ───────────────────────────────────────────────────────────
function SignInStudent({ students, setView, showToast, setCurrentStudent }) {
  const [sno, setSno] = useState("");
  const go = () => {
    if (!sno.trim()) return;
    const student = students[sno.trim()];
    if (!student) { showToast("Student number not found. Please register first.", "error"); return; }
    setCurrentStudent(student);
    showToast("Welcome back, " + student.name.split(" ")[0] + "!");
    setView("student");
  };
  return (
    <div style={S.center}>
      <div style={S.card}>
        <BackBtn onClick={() => setView("splash")} />
        <h2 style={S.cardTitle}>Student Sign-In</h2>
        <p style={S.cardSub}>Enter your student number to continue.</p>
        <Field label="Student Number" value={sno} onChange={setSno} placeholder="e.g. 2021/001234" />
        <Btn onClick={go} label="Sign In" primary full />
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
function StudentDash({ student, classes, confirmedClasses, records, pending, setPending, courses, studentStats, setView, showToast, pct, pctColor }) {
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
      <header style={S.header}>
        <div>
          <div style={S.headerTitle}>AttendTrack</div>
          <div style={S.headerSub}>NOCEN Music Dept · Welcome, {student.name}</div>
        </div>
        <Btn onClick={() => setView("splash")} label="Sign Out" small />
      </header>
      <div style={S.overallBar}>
        <Ring pct={totalPct()} size={80} />
        <div style={{ marginLeft:20 }}>
          <div style={{ fontSize:13, color:"#94a3b8", marginBottom:2 }}>Overall Attendance</div>
          <div style={{ fontSize:28, fontWeight:700, color:pctColor(totalPct()) }}>{totalPct()}%</div>
          <div style={{ fontSize:12, color: totalPct()>=75?"#22c55e":"#ef4444" }}>
            {totalPct()>=75?"✓ Satisfactory":"⚠ Below Required 75%"}
          </div>
        </div>
      </div>
      <div style={S.tabs}>
        {["attend","overview"].map(t=>(
          <div key={t} style={{...S.tab,...(tab===t?S.tabActive:{})}} onClick={()=>setTab(t)}>
            {t==="attend"?"📋 Sign Attendance":"📊 My Overview"}
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
  const [nlName, setNlName]     = useState("");
  const [nlPin, setNlPin]       = useState("");
  const [nlCourses, setNlCourses] = useState([]);
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
    const lec={id:Date.now().toString(),name:nlName.trim(),pin:nlPin.trim(),courses:nlCourses,isAdmin:false};
    setLecturers(prev=>[...prev,lec]);
    setNlName(""); setNlPin(""); setNlCourses([]);
    showToast("Lecturer added successfully.");
  };

  const removeLecturer = (id) => {
    if (id==="admin") return showToast("Cannot remove the admin account","error");
    setLecturers(prev=>prev.filter(l=>l.id!==id));
    showToast("Lecturer removed.");
  };

  const toggleNlCourse = (code) => setNlCourses(prev=>prev.includes(code)?prev.filter(c=>c!==code):[...prev,code]);

  const allPending = [];
  Object.entries(pending).forEach(([classId,sns])=>{
    const cls=classes.find(c=>c.id===classId);
    if (!cls||!myCourses.includes(cls.courseCode)) return;
    sns.forEach(sno=>{ const st=students[sno]; if(st) allPending.push({classId,cls,student:st}); });
  });

  const myClasses   = classes.filter(c=>myCourses.includes(c.courseCode));
  const myConfirmed = confirmedClasses.filter(c=>myCourses.includes(c.courseCode));

  return (
    <div style={S.page}>
      <header style={S.header}>
        <div>
          <div style={S.headerTitle}>AttendTrack</div>
          <div style={S.headerSub}>NOCEN Music Dept · {currentLecturer.name}{isAdmin?" · Admin":""}</div>
        </div>
        <Btn onClick={()=>{setCurrentLecturer(null);setView("splash");}} label="Sign Out" small />
      </header>

      <div style={S.chips}>
        <Chip label="Students" value={Object.keys(students).length} color="#6366f1" />
        <Chip label="My Classes" value={myConfirmed.length} color="#22c55e" />
        <Chip label="Pending" value={allPending.length} color="#f59e0b" />
      </div>

      {/* Today Banner */}
      <div style={S.todayBanner}>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,color:"#e2e8f0"}}>📅 {new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}</div>
          <div style={{fontSize:12,color:"#64748b",marginTop:2}}>
            {myCourses.filter(code=>(classes||[]).some(c=>c.courseCode===code&&c.date===today&&c.confirmed)).length} / {myCourses.length} courses open today
          </div>
          {classes.filter(c=>myCourses.includes(c.courseCode)&&c.date===today&&c.confirmed&&c.attendCode).map(c=>(
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
            <div style={{fontWeight:700,marginBottom:12,color:"#e2e8f0"}}>Add New Class Session</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <input style={{...S.input,flex:1,minWidth:120}} placeholder="Course code e.g. MUS 427" value={newClass.courseCode} onChange={e=>setNewClass(p=>({...p,courseCode:e.target.value}))} />
              <input type="date" style={S.input} value={newClass.date} onChange={e=>setNewClass(p=>({...p,date:e.target.value}))} />
              <input style={{...S.input,flex:2}} placeholder="Topic (optional)" value={newClass.topic} onChange={e=>setNewClass(p=>({...p,topic:e.target.value}))} />
            </div>
            <Btn onClick={addCls} label="Add Session" primary full style={{marginTop:10}} />
          </div>
          {[...myClasses].reverse().map(cls=>(
            <div key={cls.id} style={S.classCard}>
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
                  {Object.values(students).map(s => {
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
                {Object.keys(students).length===0&&<div style={{fontSize:12,color:"#475569",marginBottom:10}}>No students registered yet.</div>}
                <div style={{fontSize:12,color:"#94a3b8",marginBottom:10}}>
                  {(records[cls.id]||[]).length} of {Object.keys(students).length} students marked present
                </div>
                <div style={{display:"flex",gap:8}}>
                  <Btn onClick={()=>saveManualAttendance(cls.id)} label="💾 Save Attendance" primary small />
                  <Btn onClick={()=>setManualClassId(null)} label="Cancel" small />
                </div>
              </div>
            )}
          ))}
        </div>
      )}

      {tab==="students" && (
        <div style={S.listWrap}>
          {Object.values(students).length===0?<Empty msg="No students registered yet."/>:
            Object.values(students).map(s=>{
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
            <div style={{fontWeight:700,marginBottom:12,color:"#e2e8f0"}}>Add New Lecturer</div>
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
            <Btn onClick={addLecturer} label="Add Lecturer" primary full />
          </div>
          {lecturers.map(lec=>(
            <div key={lec.id}>
              <div style={S.classCard}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700}}>{lec.name}</div>
                  <div style={{fontSize:12,color:"#94a3b8",marginTop:3}}>
                    {lec.isAdmin?"Admin — all courses":(Array.isArray(lec.courses)?lec.courses.join(", "):"All courses")}
                  </div>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                  {!lec.isAdmin&&<>
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
          <div style={S.formCard}>
            <div style={{fontWeight:700,marginBottom:4,color:"#e2e8f0"}}>🔑 Change My PIN</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Update your login PIN securely.</div>
            <Field label="Current PIN" value={curPin} onChange={setCurPin} placeholder="Current PIN" type="password" />
            <Field label="New PIN" value={newPin} onChange={setNewPin} placeholder="New PIN" type="password" />
            <Field label="Confirm New PIN" value={confPin} onChange={setConfPin} placeholder="Re-enter new PIN" type="password" />
            <Btn onClick={changeMyPin} label="Update PIN" primary full />
          </div>
          <div style={S.formCard}>
            <div style={{fontWeight:700,marginBottom:4,color:"#e2e8f0"}}>📥 Export Attendance</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:14}}>Download records as CSV — opens in Excel.</div>
            <Btn onClick={()=>exportFullRegister({students,classes:myClasses,records,courses:myCourses,confirmedClasses:myConfirmed,pct,showToast})} label="Full Register (My Courses)" primary full />
            <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:8}}>
              {myCourses.map(code=>(
                <Btn key={code} onClick={()=>exportCourseCSV({code,students,classes,records,confirmedClasses:myConfirmed,pct,showToast})} label={code} small />
              ))}
            </div>
          </div>
          {isAdmin&&(
            <div style={S.formCard}>
              <div style={{fontWeight:700,marginBottom:4,color:"#e2e8f0"}}>💾 Backup & Restore Data</div>
              <div style={{fontSize:12,color:"#64748b",marginBottom:12}}>
                Download a full backup of all students, classes, attendance records and lecturer accounts. 
                Restore from a previous backup if data is ever lost.
              </div>
              <Btn onClick={()=>backupAllData({students,classes,records,pending,courses,lecturers,showToast})} label="⬇ Download Full Backup" primary full />
              <RestorePanel setStudents={setStudents} setClasses={setClasses} setRecords={setRecords}
                setPending={setPending} setCourses={setCourses} setLecturers={setLecturers} showToast={showToast} />
            </div>
          )}
          {isAdmin&&(
            <div style={S.formCard}>
              <div style={{fontWeight:700,marginBottom:12,color:"#e2e8f0"}}>Course Management</div>
              <div style={{display:"flex",gap:8}}>
                <input style={{...S.input,flex:1}} placeholder="New course code e.g. MUS 310" value={newCourse} onChange={e=>setNewCourse(e.target.value)} />
                <Btn onClick={()=>{
                  if(!newCourse.trim())return;
                  if(courses.includes(newCourse.trim()))return showToast("Course already exists","error");
                  setCourses(p=>[...p,newCourse.trim()]); setNewCourse(""); showToast("Course added.");
                }} label="Add" primary small />
              </div>
              <div style={{marginTop:16}}>
                {courses.map(c=>(
                  <div key={c} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid #1e293b"}}>
                    <span style={{color:"#e2e8f0"}}>{c}</span>
                    <span style={{fontSize:12,color:"#ef4444",cursor:"pointer"}} onClick={()=>setCourses(p=>p.filter(x=>x!==c))}>Remove</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Backup & Restore ─────────────────────────────────────────────────────────
function backupAllData({ students, classes, records, pending, courses, lecturers, showToast }) {
  const backup = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    school: "Nwafor Orizu College of Education",
    department: "Music",
    data: { students, classes, records, pending, courses, lecturers }
  };
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `AttendTrack_Backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("Full backup downloaded successfully!");
}

function RestorePanel({ setStudents, setClasses, setRecords, setPending, setCourses, setLecturers, showToast }) {
  const [dragging, setDragging] = useState(false);

  const processFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        if (!backup.data) return showToast("Invalid backup file", "error");
        const { students, classes, records, pending, courses, lecturers } = backup.data;
        if (students)  setStudents(students);
        if (classes)   setClasses(classes);
        if (records)   setRecords(records);
        if (pending)   setPending(pending);
        if (courses)   setCourses(courses);
        if (lecturers) setLecturers(lecturers);
        showToast("Data restored successfully from backup!");
      } catch {
        showToast("Could not read backup file — make sure it is a valid AttendTrack backup.", "error");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      onDragOver={e=>{e.preventDefault();setDragging(true);}}
      onDragLeave={()=>setDragging(false)}
      onDrop={e=>{e.preventDefault();setDragging(false);processFile(e.dataTransfer.files[0]);}}
      style={{border:`2px dashed ${dragging?"#6366f1":"#1e293b"}`,borderRadius:10,padding:"16px",textAlign:"center",marginTop:10,cursor:"pointer",background:dragging?"#1e1b4b":"transparent"}}
      onClick={()=>document.getElementById("restore-input").click()}
    >
      <div style={{fontSize:12,color:"#64748b"}}>📂 Drop backup file here or tap to select</div>
      <input id="restore-input" type="file" accept=".json" style={{display:"none"}}
        onChange={e=>processFile(e.target.files[0])} />
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
  return <div style={{...S.chip,borderColor:color}}><div style={{fontSize:22,fontWeight:800,color}}>{value}</div><div style={{fontSize:11,color:"#64748b"}}>{label}</div></div>;
}
function Ring({ pct:p, size=60 }) {
  const r=size/2-6,circ=2*Math.PI*r,offset=circ-(p/100)*circ,col=p>=75?"#22c55e":p>=50?"#f59e0b":"#ef4444";
  return <svg width={size} height={size} style={{flexShrink:0}}><circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={7}/><circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={7} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/><text x="50%" y="54%" textAnchor="middle" fill={col} fontSize={size*0.22} fontWeight="700">{p}%</text></svg>;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  root:{ minHeight:"100vh",background:"#0a0f1e",fontFamily:"'DM Sans','Segoe UI',sans-serif",color:"#e2e8f0",position:"relative",overflowX:"hidden" },
  grain:{ position:"fixed",inset:0,pointerEvents:"none",backgroundImage:`url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`,opacity:.6,zIndex:0 },
  center:{ minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:16,position:"relative",zIndex:1 },
  splashCard:{ background:"linear-gradient(145deg,#111827,#0f172a)",border:"1px solid #1e293b",borderRadius:24,padding:48,textAlign:"center",maxWidth:380,width:"100%",boxShadow:"0 32px 64px rgba(0,0,0,.5)" },
  logo:{ fontSize:52,marginBottom:12,filter:"drop-shadow(0 0 20px #6366f1aa)" },
  logoCrest:{ width:100,height:100,borderRadius:"50%",background:"#f8f8f8",border:"3px solid #fbbf24",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",boxShadow:"0 0 28px rgba(251,191,36,0.4)",overflow:"hidden",padding:4 },
  schoolName:{ fontSize:13,fontWeight:700,color:"#fbbf24",letterSpacing:"0.5px",textTransform:"uppercase",marginBottom:2 },
  deptName:{ fontSize:11,color:"#86efac",marginBottom:16 },
  copyright:{ marginTop:24,fontSize:11,color:"#334155",borderTop:"1px solid #1e293b",paddingTop:12 },
  splashTitle:{ margin:0,fontSize:34,fontWeight:800,letterSpacing:"-1px",background:"linear-gradient(135deg,#818cf8,#c084fc)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" },
  splashSub:{ color:"#475569",marginTop:8,fontSize:14 },
  card:{ background:"#111827",border:"1px solid #1e293b",borderRadius:20,padding:32,maxWidth:420,width:"100%",boxShadow:"0 20px 40px rgba(0,0,0,.4)" },
  cardTitle:{ margin:"0 0 6px",fontSize:22,fontWeight:700 },
  cardSub:{ color:"#64748b",fontSize:13,marginBottom:24 },
  page:{ maxWidth:620,margin:"0 auto",padding:"0 0 40px",position:"relative",zIndex:1 },
  header:{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"20px 20px 0",marginBottom:20 },
  headerTitle:{ fontSize:20,fontWeight:800,background:"linear-gradient(135deg,#818cf8,#c084fc)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent" },
  headerSub:{ fontSize:12,color:"#475569" },
  overallBar:{ display:"flex",alignItems:"center",background:"#111827",border:"1px solid #1e293b",borderRadius:16,padding:"16px 20px",margin:"0 16px 20px" },
  tabs:{ display:"flex",gap:4,padding:"0 16px",marginBottom:12 },
  tab:{ padding:"8px 16px",borderRadius:10,fontSize:13,cursor:"pointer",color:"#64748b",background:"transparent",userSelect:"none",position:"relative" },
  tabActive:{ background:"#1e293b",color:"#e2e8f0",fontWeight:600 },
  listWrap:{ padding:"0 16px" },
  classCard:{ display:"flex",alignItems:"center",gap:12,background:"#111827",border:"1px solid #1e293b",borderRadius:14,padding:"14px 16px",marginBottom:10 },
  courseCard:{ background:"#111827",border:"1px solid #1e293b",borderRadius:14,padding:"14px 16px",marginBottom:10 },
  formCard:{ background:"#111827",border:"1px solid #1e293b",borderRadius:14,padding:18,marginBottom:16 },
  barBg:{ height:6,background:"#1e293b",borderRadius:99,overflow:"hidden",marginTop:6 },
  barFill:{ height:"100%",borderRadius:99,transition:"width .4s ease" },
  btn:{ border:"none",borderRadius:10,padding:"10px 20px",fontSize:14,fontWeight:600,cursor:"pointer",transition:"opacity .15s",display:"inline-flex",alignItems:"center",justifyContent:"center" },
  btnPrimary:{ background:"linear-gradient(135deg,#6366f1,#8b5cf6)",color:"#fff" },
  btnSecondary:{ background:"#1e293b",color:"#94a3b8" },
  btnDanger:{ background:"#7f1d1d",color:"#fca5a5" },
  label:{ display:"block",fontSize:12,color:"#64748b",marginBottom:6 },
  input:{ width:"100%",boxSizing:"border-box",background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,padding:"10px 14px",color:"#e2e8f0",fontSize:14,outline:"none" },
  select:{ background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,padding:"10px 14px",color:"#e2e8f0",fontSize:13,outline:"none" },
  badge:{ display:"inline-block",fontSize:10,background:"#1e293b",color:"#f59e0b",borderRadius:99,padding:"2px 8px",marginTop:4 },
  badge2:{ display:"inline-block",background:"#f59e0b",color:"#000",borderRadius:99,fontSize:10,fontWeight:700,padding:"1px 6px",marginLeft:6 },
  chips:{ display:"flex",gap:10,padding:"0 16px",marginBottom:20 },
  chip:{ flex:1,background:"#111827",border:"1px solid",borderRadius:14,padding:"12px 16px",textAlign:"center" },
  overlay:{ position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100,padding:16 },
  modal:{ background:"#111827",border:"1px solid #1e293b",borderRadius:20,padding:24,width:"100%",maxWidth:400 },
  toast:{ position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",padding:"10px 24px",borderRadius:12,color:"#fff",fontSize:13,fontWeight:600,zIndex:200,boxShadow:"0 8px 24px rgba(0,0,0,.4)" },
  courseChip:{ padding:"6px 14px",borderRadius:99,fontSize:12,cursor:"pointer",background:"#1e293b",color:"#64748b",border:"1px solid #1e293b" },
  courseChipActive:{ background:"#312e81",color:"#a5b4fc",border:"1px solid #6366f1" },
  todayBanner:{ display:"flex",alignItems:"center",gap:12,background:"linear-gradient(135deg,#1e1b4b,#1e293b)",border:"1px solid #3730a3",borderRadius:14,padding:"14px 16px",margin:"0 16px 16px" },
  codeInput:{ width:110,background:"#0f172a",border:"2px solid #6366f1",borderRadius:8,padding:"8px 10px",color:"#a5b4fc",fontSize:18,fontWeight:800,letterSpacing:6,textAlign:"center",outline:"none" },
};
