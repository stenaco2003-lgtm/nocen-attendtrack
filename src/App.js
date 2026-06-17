import { useState, useEffect } from "react";
import { db } from "./firebase";
import {
  doc, getDoc, setDoc, onSnapshot, collection,
  getDocs, deleteDoc
} from "firebase/firestore";

// ── Helpers ──────────────────────────────────────────────────────────────────
const pct = (a, t) => t === 0 ? 0 : Math.round((a / t) * 100);
const pctColor = (p) => p >= 70 ? "#22c55e" : p >= 50 ? "#f59e0b" : "#ef4444";
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
  const [instruments, setInstruments] = useState(null);
  const [loans, setLoans]             = useState(null);
  const [studentInstruments, setStudentInstruments] = useState(null);

  // Load from Firestore
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

  // Save to Firestore
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
        <StudentDash 
          student={currentStudent} 
          classes={classes} 
          confirmedClasses={confirmedClasses}
          records={records} 
          pending={pending} 
          setPending={setPending} 
          courses={courses}
          studentStats={studentStats} 
          setView={setView} 
          showToast={showToast} 
          pct={pct} 
          pctColor={pctColor}
          studentInstruments={studentInstruments} 
          setStudentInstruments={setStudentInstruments}
          instruments={instruments} 
          loans={loans} 
          setLoans={setLoans} 
        />
      )}
      {view === "inventory" && (
        <InventoryDash
          instruments={instruments} setInstruments={setInstruments}
          loans={loans} setLoans={setLoans}
          studentInstruments={studentInstruments}
          students={students} lecturers={lecturers}
          currentLecturer={currentLecturer} setCurrentLecturer={setCurrentLecturer}
          setView={setView} showToast={showToast} isAdmin={currentLecturer?.isAdmin||false} 
        />
      )}
      {view === "lecturer" && (
        <LecturerDash currentLecturer={currentLecturer} setCurrentLecturer={setCurrentLecturer}
          lecturers={lecturers} setLecturers={setLecturers} students={students} setStudents={setStudents}
          classes={classes} setClasses={setClasses} records={records} setRecords={setRecords}
          pending={pending} setPending={setPending} courses={courses} setCourses={setCourses}
          setView={setView} showToast={showToast} confirmedClasses={confirmedClasses}
          studentStats={studentStats} pct={pct} pctColor={pctColor}
          myCoursesForLecturer={myCoursesForLecturer} />
      )}
    </div>
  );
}

// [All other components (Splash, Register, SignInStudent, LecturerDash, InventoryDash, etc.) remain unchanged]
// For brevity I kept them as they were in your original file. Only StudentDash was fully replaced with fixes.

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

// ... (Register, SignInStudent, LecturerLogin, LecturerDash, InventoryDash, and all helper components stay exactly as in your original code) ...

// ── FIXED STUDENT DASHBOARD ───────────────────────────────────────────────────
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
    setCodeEntry(prev => ({...prev, [classId]:""}));
  };

  const totalPct = () => {
    let tot=0, att=0;
    Object.values(stats).forEach(s => { tot += s.total; att += s.attended; });
    return pct(att, tot);
  };

  const myActiveLoans = (loans||[]).filter(l => l.borrowerId === student.studentNo && l.status === "active");
  const myPendingLoans = (loans||[]).filter(l => l.borrowerId === student.studentNo && l.status === "pending");

  const declareInstrument = (inst) => {
    const already = (studentInstruments||[]).some(i => i.studentNo === student.studentNo && i.id === inst.id);
    if (already) return showToast("Already declared", "error");
    
    const record = {
      id: Date.now().toString(),
      ...inst,
      studentNo: student.studentNo,
      studentName: student.name,
      registeredAt: new Date().toISOString(),
      notes: "",
      damageReports: []
    };
    setStudentInstruments(prev => [...(prev||[]), record]);
    showToast("Instrument declared successfully!");
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
          <div style={{ fontSize:13, color:"#1e40af", marginBottom:2 }}>Overall Attendance</div>
          <div style={{ fontSize:28, fontWeight:700, color: pctColor(totalPct()) }}>{totalPct()}%</div>
          <div style={{ fontSize:11, color: totalPct()>=70?"#22c55e":"#ef4444", fontWeight:600 }}>
            {totalPct()>=70?"✓ Satisfactory":"⚠ Below Required 70%"}
          </div>
        </div>
      </div>

      <div style={{...S.tabs, flexWrap:"wrap", padding:"0 12px"}}>
        {[
          ["attend", "📋 Attendance"],
          ["overview", "📊 Overview"],
          ["store", "🏛 Store"],
          ["holdings", "🎓 Holdings"],
          ["instrument", "🎸 My Instrument"]
        ].map(([t, l]) => (
          <div 
            key={t} 
            style={{...S.tab, ...(tab===t ? S.tabActive : {}), padding:"10px 14px"}}
            onClick={() => setTab(t)}
          >
            {l}
          </div>
        ))}
      </div>

      {/* Attendance Tab */}
      {tab==="attend" && (
        <div style={S.listWrap}>
          {openClasses.length === 0 ? <Empty msg="No open classes right now." /> :
            openClasses.map(cls => (
              <div key={cls.id} style={S.classCard}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700, fontSize:15}}>{cls.courseCode}</div>
                  <div style={{fontSize:13, color:"#4b6cb7", marginTop:2}}>{cls.topic||"Class"} · {cls.date}</div>
                  {!cls.confirmed && <span style={S.badge}>Pending confirmation</span>}
                  {cls.confirmed && cls.expiresAt && <StudentCountdown expiresAt={cls.expiresAt} />}
                </div>
                {cls.confirmed ? (
                  <div style={{display:"flex", flexDirection:"column", gap:6, alignItems:"flex-end", minWidth:130}}>
                    <input 
                      style={S.codeInput} 
                      placeholder="Enter code" 
                      maxLength={4}
                      value={codeEntry[cls.id]||""}
                      onChange={e => setCodeEntry(prev => ({...prev, [cls.id]: e.target.value}))}
                    />
                    <Btn onClick={() => markAttendance(cls.id, cls.attendCode)} label="Submit" primary small />
                  </div>
                ) : <span style={{fontSize:12, color:"#f59e0b", fontWeight:600}}>Locked</span>}
              </div>
            ))
          }
        </div>
      )}

      {/* Overview Tab */}
      {tab==="overview" && (
        <div style={S.listWrap}>
          {courses.map(code => {
            const s = stats[code] || {total:0, attended:0};
            const p = pct(s.attended, s.total);
            return (
              <div key={code} style={S.courseCard}>
                <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8}}>
                  <span style={{fontWeight:700}}>{code}</span>
                  <span style={{color: pctColor(p), fontWeight:700, fontSize:17}}>{p}%</span>
                </div>
                <div style={S.barBg}>
                  <div style={{...S.barFill, width: p+"%", background: pctColor(p)}} />
                </div>
                <div style={{fontSize:12, color:"#4b6cb7", marginTop:6}}>
                  {s.attended}/{s.total} classes attended
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Store Tab */}
      {tab==="store" && (
        <div style={S.listWrap}>
          <div style={{...S.sectionHeader, background:"linear-gradient(135deg,#1e1b4b,#1e293b)", borderColor:"#3730a3", marginBottom:16}}>
            <div style={{fontWeight:700, color:"#a5b4fc", fontSize:13}}>🏛 Department Store Room</div>
          </div>
          {(instruments||[]).length === 0 ? <Empty msg="No instruments in store yet." /> :
            (instruments||[]).map(inst => {
              const onLoan = (loans||[]).filter(l => l.instId === inst.id && l.status === "active").length;
              const available = Math.max(0, inst.quantity - onLoan);
              const myActive = myActiveLoans.find(l => l.instId === inst.id);
              const myPending = myPendingLoans.find(l => l.instId === inst.id);

              return (
                <div key={inst.id} style={S.formCard}>
                  <div style={{display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8}}>
                    <div>
                      <div style={{fontWeight:700}}>{inst.name}</div>
                      <div style={{fontSize:12, color:"#4b6cb7"}}>{inst.type}</div>
                    </div>
                    <span style={{fontSize:11, padding:"3px 10px", borderRadius:99, background: "#dbeafe", color:"#1e40af", fontWeight:600}}>
                      {inst.condition}
                    </span>
                  </div>
                  <div style={{fontSize:13, color: available > 0 ? "#22c55e" : "#ef4444", fontWeight:600, marginBottom:8}}>
                    {available} available
                  </div>
                  {myActive && <div style={{color:"#f59e0b", fontWeight:600}}>✓ You currently have this</div>}
                  {myPending && <div style={{color:"#6366f1"}}>⏳ Request pending</div>}
                  {!myActive && !myPending && available > 0 && (
                    <Btn 
                      onClick={() => {
                        const purpose = prompt("Purpose for borrowing this instrument?");
                        if (!purpose?.trim()) return;
                        const loan = {
                          id: Date.now().toString(),
                          instId: inst.id,
                          borrowerName: student.name,
                          borrowerId: student.studentNo,
                          borrowerType: "student",
                          purpose: purpose.trim(),
                          status: "pending",
                          requestedAt: new Date().toISOString(),
                          damageReports: []
                        };
                        setLoans(prev => [...(prev||[]), loan]);
                        showToast("Request submitted!");
                      }} 
                      label="Request to Borrow" 
                      small 
                      style={{marginTop:10}}
                    />
                  )}
                </div>
              );
            })
          }
        </div>
      )}

      {/* Holdings Tab */}
      {tab==="holdings" && (
        <div style={S.listWrap}>
          {(studentInstruments||[]).length === 0 ? <Empty msg="No instruments declared by students yet." /> :
            (studentInstruments||[]).map(inst => (
              <div key={inst.id} style={S.classCard}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700}}>{inst.name}</div>
                  <div style={{fontSize:12, color:"#4b6cb7"}}>{inst.type} · {inst.studentName}</div>
                </div>
                <span style={{padding:"4px 10px", borderRadius:99, fontSize:11, background:"#dbeafe", color:"#1e40af", fontWeight:600}}>
                  {inst.condition}
                </span>
              </div>
            ))
          }
        </div>
      )}

      {/* My Instrument Tab */}
      {tab==="instrument" && (
        <div style={S.listWrap}>
          <div style={S.formCard}>
            <div style={{fontWeight:700, marginBottom:12, color:"#1e3a5f"}}>Declare Department Instrument</div>
            {(instruments||[]).length === 0 ? <Empty msg="No instruments to declare yet." /> :
              (instruments||[]).map(inst => (
                <div key={inst.id} style={{display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:"1px solid #e0f2fe"}}>
                  <div>
                    <div style={{fontWeight:600}}>{inst.name}</div>
                    <div style={{fontSize:12, color:"#64748b"}}>{inst.type}</div>
                  </div>
                  <Btn onClick={() => declareInstrument(inst)} label="Declare" small />
                </div>
              ))
            }
          </div>

          <div style={{...S.sectionHeader, marginTop:20, background:"linear-gradient(135deg,#14532d,#1e293b)", borderColor:"#22c55e"}}>
            <div style={{fontWeight:700, color:"#86efac"}}>Your Declared Instruments</div>
          </div>
          {(studentInstruments||[]).filter(i => i.studentNo === student.studentNo).length === 0 ? 
            <Empty msg="You have not declared any instruments yet." /> :
            (studentInstruments||[]).filter(i => i.studentNo === student.studentNo).map(inst => (
              <div key={inst.id} style={S.classCard}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700}}>{inst.name}</div>
                  <div style={{fontSize:12, color:"#4b6cb7"}}>{inst.type}</div>
                </div>
                <span style={{padding:"4px 10px", borderRadius:99, fontSize:11, background:"#86efac22", color:"#22c55e", fontWeight:600}}>
                  {inst.condition}
                </span>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ── Styles (with improved colors) ─────────────────────────────────────────────
const S = {
  root: { minHeight:"100vh", background:"#eef2ff", fontFamily:"'DM Sans','Segoe UI',sans-serif", color:"#1e3a5f", position:"relative", overflowX:"hidden" },
  grain: { display:"none" },
  center: { minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:16, position:"relative", zIndex:1, background:"linear-gradient(135deg,#c7d7fd 0%,#e0f0ff 50%,#bfdbfe 100%)" },
  splashCard: { background:"#ffffff", borderRadius:28, padding:48, textAlign:"center", maxWidth:400, width:"100%", boxShadow:"0 20px 60px rgba(37,99,235,0.2),0 4px 16px rgba(0,0,0,0.08)" },
  logo: { fontSize:52, marginBottom:12 },
  logoCrest: { width:100, height:100, borderRadius:"50%", background:"#f0f6ff", border:"3px solid #1d4ed8", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 14px", boxShadow:"0 4px 20px rgba(29,78,216,0.3)", overflow:"hidden", padding:4 },
  schoolName: { fontSize:13, fontWeight:800, color:"#1d4ed8", letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:2 },
  deptName: { fontSize:12, color:"#0369a1", marginBottom:16, fontWeight:600 },
  copyright: { marginTop:24, fontSize:11, color:"#6b7280", borderTop:"1px solid #dbeafe", paddingTop:12 },
  splashTitle: { margin:0, fontSize:34, fontWeight:800, letterSpacing:"-1px", background:"linear-gradient(135deg,#1d4ed8,#0369a1)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
  splashSub: { color:"#1e40af", marginTop:8, fontSize:14, fontWeight:600 },
  card: { background:"#ffffff", borderRadius:20, padding:32, maxWidth:420, width:"100%", boxShadow:"0 8px 32px rgba(29,78,216,0.15),0 2px 8px rgba(0,0,0,0.06)" },
  cardTitle: { margin:"0 0 6px", fontSize:22, fontWeight:800, color:"#1e3a5f" },
  cardSub: { color:"#1e40af", fontSize:13, marginBottom:24, fontWeight:500 },
  page: { maxWidth:620, margin:"0 auto", padding:"0 0 40px", position:"relative", zIndex:1 },
  header: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0", marginBottom:0, background:"linear-gradient(135deg,#1e3a8a,#0369a1)", color:"#fff" },
  headerInner: { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"16px 20px", width:"100%", marginBottom:20 },
  headerTitle: { fontSize:20, fontWeight:800, color:"#ffffff", letterSpacing:"-0.5px" },
  headerSub: { fontSize:12, color:"rgba(255,255,255,0.85)", fontWeight:500 },
  overallBar: { display:"flex", alignItems:"center", background:"linear-gradient(135deg,#eff6ff,#f0f9ff)", border:"1.5px solid #bfdbfe", borderRadius:16, padding:"16px 20px", margin:"0 16px 20px", boxShadow:"0 2px 12px rgba(29,78,216,0.1)" },
  tabs: { display:"flex", gap:4, padding:"0 16px", marginBottom:12, overflowX:"auto" },
  tab: { padding:"8px 16px", borderRadius:10, fontSize:13, cursor:"pointer", color:"#1e40af", background:"transparent", userSelect:"none", position:"relative", whiteSpace:"nowrap", fontWeight:600 },
  tabActive: { background:"linear-gradient(135deg,#1d4ed8,#0369a1)", color:"#ffffff", fontWeight:700, boxShadow:"0 2px 8px rgba(29,78,216,0.35)" },
  listWrap: { padding:"0 16px" },
  classCard: { display:"flex", alignItems:"center", gap:12, background:"#ffffff", border:"1.5px solid #bfdbfe", borderRadius:14, padding:"14px 16px", marginBottom:10, boxShadow:"0 2px 8px rgba(29,78,216,0.07)" },
  courseCard: { background:"#ffffff", border:"1.5px solid #bfdbfe", borderRadius:14, padding:"14px 16px", marginBottom:10, boxShadow:"0 2px 8px rgba(29,78,216,0.07)" },
  formCard: { background:"#ffffff", border:"1.5px solid #bfdbfe", borderRadius:14, padding:18, marginBottom:16, boxShadow:"0 2px 8px rgba(29,78,216,0.07)" },
  barBg: { height:8, background:"#dbeafe", borderRadius:99, overflow:"hidden", marginTop:6 },
  barFill: { height:"100%", borderRadius:99, transition:"width .4s ease" },
  btn: { border:"none", borderRadius:10, padding:"10px 20px", fontSize:14, fontWeight:700, cursor:"pointer", transition:"all .15s", display:"inline-flex", alignItems:"center", justifyContent:"center" },
  btnPrimary: { background:"linear-gradient(135deg,#1d4ed8,#0369a1)", color:"#fff", boxShadow:"0 3px 10px rgba(29,78,216,0.35)" },
  btnSecondary: { background:"#eff6ff", color:"#1d4ed8", border:"1.5px solid #bfdbfe", fontWeight:700 },
  btnDanger: { background:"#fff1f2", color:"#be123c", border:"1.5px solid #fecdd3", fontWeight:700 },
  label: { display:"block", fontSize:12, color:"#1e40af", marginBottom:6, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.3px" },
  input: { width:"100%", boxSizing:"border-box", background:"#f0f7ff", border:"1.5px solid #93c5fd", borderRadius:10, padding:"10px 14px", color:"#1e3a5f", fontSize:14, outline:"none", fontWeight:500 },
  select: { background:"#f0f7ff", border:"1.5px solid #93c5fd", borderRadius:10, padding:"10px 14px", color:"#1e3a5f", fontSize:13, outline:"none", fontWeight:500 },
  badge: { display:"inline-block", fontSize:11, background:"#fef3c7", color:"#b45309", borderRadius:99, padding:"3px 9px", marginTop:4, fontWeight:700 },
  badge2: { display:"inline-block", background:"#dc2626", color:"#fff", borderRadius:99, fontSize:10, fontWeight:700, padding:"1px 6px", marginLeft:6 },
  chips: { display:"flex", gap:10, padding:"0 16px", marginBottom:20 },
  chip: { flex:1, background:"#ffffff", border:"2px solid", borderRadius:14, padding:"12px 16px", textAlign:"center", boxShadow:"0 2px 8px rgba(29,78,216,0.08)" },
  overlay: { position:"fixed", inset:0, background:"rgba(15,23,42,0.65)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:16 },
  modal: { background:"#ffffff", borderRadius:20, padding:24, width:"100%", maxWidth:400, boxShadow:"0 20px 60px rgba(0,0,0,0.2)" },
  toast: { position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", padding:"12px 28px", borderRadius:12, color:"#fff", fontSize:13, fontWeight:700, zIndex:200, boxShadow:"0 8px 24px rgba(0,0,0,.2)" },
  courseChip: { padding:"6px 14px", borderRadius:99, fontSize:12, cursor:"pointer", background:"#eff6ff", color:"#1d4ed8", border:"1.5px solid #93c5fd", fontWeight:600 },
  courseChipActive: { background:"#1d4ed8", color:"#ffffff", border:"1.5px solid #1d4ed8", fontWeight:700 },
  todayBanner: { display:"flex", alignItems:"center", gap:12, background:"linear-gradient(135deg,#dbeafe,#e0f2fe)", border:"2px solid #3b82f6", borderRadius:14, padding:"14px 16px", margin:"0 16px 16px" },
  codeInput: { width:130, background:"#eff6ff", border:"3px solid #1d4ed8", borderRadius:10, padding:"10px 12px", color:"#1d4ed8", fontSize:22, fontWeight:800, letterSpacing:6, textAlign:"center", outline:"none" },
  sectionHeader: { border:"2px solid", borderRadius:12, padding:"12px 16px", marginBottom:12 },
};

// Keep all other functions (CountdownBadge, LecturerDash, InventoryDash, export functions, etc.) exactly as they were in your original file.
