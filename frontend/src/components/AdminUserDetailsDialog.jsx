import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Paper,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  AccessTime,
  Block,
  CalendarMonth,
  CheckCircle,
  Close,
  Computer,
  History,
  ReportProblem,
} from "@mui/icons-material";

const API_URL = import.meta.env.VITE_API_URL;

const getInitials = (user) => {
  const initials = `${user?.first_name?.[0] || ""}${user?.last_name?.[0] || ""}`;
  return initials.toUpperCase() || "U";
};

const stringToColor = (value) => {
  if (!value) return "#cbd5e1";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  let color = "#";
  for (let index = 0; index < 3; index += 1) {
    color += `00${((hash >> (index * 8)) & 0xff).toString(16)}`.slice(-2);
  }
  return color;
};

const getProfileImage = (profilePic) => {
  if (!profilePic || !API_URL) return "";
  return `${API_URL}/${profilePic.replace(/^\/+/, "")}`;
};

const formatDate = (value) => {
  if (!value) return "—";
  const rawValue = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawValue)
    ? new Date(`${rawValue}T00:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "ยังไม่มีข้อมูล";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ยังไม่มีข้อมูล";
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value)) return "—";
  if (value < 60) return `${value} วินาที`;
  return `${Math.floor(value / 60)} นาที`;
};

const getRoleLabel = (role) => ({
  student: "Student",
  guest: "Guest",
}[role] || "User");

const getScoreColor = (score) => {
  if (score < 40) return "#ef4444";
  if (score < 80) return "#f59e0b";
  return "#10b981";
};

const getBookingStatus = (status) => ({
  reserved: { label: "รอยืนยัน", color: "#2563eb", bg: "#eff6ff" },
  attended: { label: "เข้าใช้งานแล้ว", color: "#047857", bg: "#ecfdf5" },
  completed: { label: "เสร็จสิ้น", color: "#047857", bg: "#ecfdf5" },
  cancelled: { label: "ยกเลิก", color: "#64748b", bg: "#f1f5f9" },
  no_show: { label: "ไม่มาตามนัด", color: "#b91c1c", bg: "#fef2f2" },
}[status] || { label: status || "ไม่ระบุ", color: "#64748b", bg: "#f1f5f9" });

const getSessionStatus = (status) => ({
  active: { label: "กำลังใช้งาน", color: "#047857", bg: "#ecfdf5" },
  completed: { label: "จบปกติ", color: "#2563eb", bg: "#eff6ff" },
  abandoned: { label: "ขาดการเชื่อมต่อ", color: "#b91c1c", bg: "#fef2f2" },
}[status] || { label: status || "ไม่ระบุ", color: "#64748b", bg: "#f1f5f9" });

const getPointReason = (reason) => ({
  daily_bonus: "Daily bonus",
  no_show: "ไม่มาตามการจอง",
  forbidden_app: "ใช้โปรแกรมต้องห้าม",
  late_cancel: "ยกเลิกการจองกระชั้นชิด",
  complete_session: "จบ Session ปกติ",
  admin_grant: "Admin อนุมัติเพิ่มคะแนน",
}[reason] || reason || "ปรับคะแนน");

function EmptyHistory({ icon, title, description }) {
  return (
    <Box sx={{ py: 7, textAlign: "center", color: "#94a3b8" }}>
      {icon}
      <Typography variant="subtitle1" fontWeight="700" color="#64748b">
        {title}
      </Typography>
      <Typography variant="body2" color="#94a3b8" sx={{ mt: 0.5 }}>
        {description}
      </Typography>
    </Box>
  );
}

function ProfileField({ label, value }) {
  return (
    <Box>
      <Typography variant="caption" color="#94a3b8" fontWeight="700">
        {label}
      </Typography>
      <Typography variant="body2" color="#334155" fontWeight="600" sx={{ mt: 0.35, overflowWrap: "anywhere" }}>
        {value || "ไม่มีข้อมูล"}
      </Typography>
    </Box>
  );
}

function UserBookings({ rows }) {
  if (!rows.length) {
    return <EmptyHistory icon={<CalendarMonth sx={{ fontSize: 52, mb: 1 }} />} title="ยังไม่มีประวัติการจอง" description="ผู้ใช้นี้ยังไม่เคยสร้างรายการจองห้อง" />;
  }

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table sx={{ minWidth: 760 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: "#f8fafc" }}>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>วันและเวลา</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>ห้อง</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>วัตถุประสงค์</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>สถานะ</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((booking) => {
            const status = getBookingStatus(booking.status);
            return (
              <TableRow key={booking.id} sx={{ "& td": { borderBottom: "1px solid #f1f5f9" } }}>
                <TableCell>
                  <Typography variant="body2" fontWeight="700" color="#334155">{formatDate(booking.booking_date)}</Typography>
                  <Typography variant="caption" color="#94a3b8">{booking.start_time || "—"} - {booking.end_time || "—"}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="700" color="#334155">{booking.lab_code || "—"}</Typography>
                  <Typography variant="caption" color="#94a3b8">{booking.lab_name || "ไม่ระบุห้อง"}</Typography>
                </TableCell>
                <TableCell sx={{ maxWidth: 260, overflowWrap: "anywhere" }}>{booking.purpose || "ไม่ได้ระบุ"}</TableCell>
                <TableCell><Chip label={status.label} size="small" sx={{ bgcolor: status.bg, color: status.color, fontWeight: "800" }} /></TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function UserSessions({ rows }) {
  if (!rows.length) {
    return <EmptyHistory icon={<AccessTime sx={{ fontSize: 52, mb: 1 }} />} title="ยังไม่มีประวัติ Session" description="ยังไม่มีข้อมูลการเข้าใช้งานห้องของผู้ใช้นี้" />;
  }

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table sx={{ minWidth: 860 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: "#f8fafc" }}>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>เข้า - ออก</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>ห้อง</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>สถานะ</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>เครื่องที่ใช้งาน</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>สาเหตุจบ</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((session) => {
            const status = getSessionStatus(session.session_status);
            return (
              <TableRow key={session.id} sx={{ "& td": { borderBottom: "1px solid #f1f5f9" } }}>
                <TableCell>
                  <Typography variant="body2" fontWeight="700" color="#334155">{formatDateTime(session.entry_time)}</Typography>
                  <Typography variant="caption" color="#94a3b8">ถึง {formatDateTime(session.exit_time)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="700" color="#334155">{session.lab_code || "—"}</Typography>
                  <Typography variant="caption" color="#94a3b8">{session.lab_name || "ไม่ระบุห้อง"}</Typography>
                </TableCell>
                <TableCell><Chip label={status.label} size="small" sx={{ bgcolor: status.bg, color: status.color, fontWeight: "800" }} /></TableCell>
                <TableCell>
                  <Typography variant="body2" color="#334155">{session.device_used || "ไม่ระบุเครื่อง"}</Typography>
                  <Typography variant="caption" color="#94a3b8">{session.device_mac || "ไม่ระบุ MAC"}</Typography>
                </TableCell>
                <TableCell sx={{ color: "#64748b" }}>{session.end_reason || "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function UserProgramUsage({ rows }) {
  if (!rows.length) {
    return <EmptyHistory icon={<Computer sx={{ fontSize: 52, mb: 1 }} />} title="ยังไม่มีประวัติการใช้โปรแกรม" description="Agent ยังไม่มีข้อมูลโปรแกรมจาก Session ของผู้ใช้นี้" />;
  }

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table sx={{ minWidth: 860 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: "#f8fafc" }}>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>เวลา</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>โปรแกรม</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>ห้อง</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>ระยะเวลา</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>เครื่อง</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((usage) => (
            <TableRow key={usage.id} sx={{ "& td": { borderBottom: "1px solid #f1f5f9" } }}>
              <TableCell>
                <Typography variant="body2" fontWeight="700" color="#334155">{formatDateTime(usage.usage_start_time)}</Typography>
                <Typography variant="caption" color="#94a3b8">ถึง {formatDateTime(usage.usage_end_time)}</Typography>
              </TableCell>
              <TableCell sx={{ maxWidth: 220, overflowWrap: "anywhere" }}>
                <Typography variant="body2" fontWeight="700" color="#334155">{usage.program_name || "ไม่ระบุ"}</Typography>
                <Typography variant="caption" color="#94a3b8">Event #{usage.id}</Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" fontWeight="700" color="#334155">{usage.lab_code || "—"}</Typography>
                <Typography variant="caption" color="#94a3b8">{usage.lab_name || "ไม่ระบุห้อง"}</Typography>
              </TableCell>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDuration(usage.duration_seconds)}</TableCell>
              <TableCell sx={{ maxWidth: 180, overflowWrap: "anywhere" }}>{usage.device_name || "ไม่ระบุเครื่อง"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function UserViolations({ rows }) {
  if (!rows.length) {
    return <EmptyHistory icon={<CheckCircle sx={{ fontSize: 52, mb: 1, color: "#10b981" }} />} title="ไม่พบการละเมิด" description="ยังไม่มีรายการใช้โปรแกรมที่ผิดกฎของผู้ใช้นี้" />;
  }

  return (
    <TableContainer sx={{ overflowX: "auto" }}>
      <Table sx={{ minWidth: 900 }}>
        <TableHead>
          <TableRow sx={{ bgcolor: "#f8fafc" }}>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>ตรวจพบเมื่อ</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>โปรแกรม</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>หลักฐาน</TableCell>
            <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>การดำเนินการ</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((violation) => (
            <TableRow key={violation.id} sx={{ "& td": { borderBottom: "1px solid #f1f5f9" } }}>
              <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDateTime(violation.detected_at)}</TableCell>
              <TableCell sx={{ maxWidth: 220, overflowWrap: "anywhere" }}>
                <Typography variant="body2" fontWeight="700" color="#b91c1c">{violation.program_name || "ไม่ระบุ"}</Typography>
                <Typography variant="caption" color="#94a3b8">{violation.reason || "ไม่ระบุเหตุผล"}</Typography>
              </TableCell>
              <TableCell sx={{ maxWidth: 330, overflowWrap: "anywhere" }}>
                <Typography variant="body2" color="#334155">{violation.process_name || "ไม่ระบุ process"}</Typography>
                <Typography variant="caption" color="#94a3b8">{violation.window_title || violation.exe_path || "ไม่มีรายละเอียดเพิ่มเติม"}</Typography>
              </TableCell>
              <TableCell><Chip icon={<ReportProblem />} label={violation.action_taken || "บันทึกเหตุการณ์"} size="small" sx={{ bgcolor: "#fef2f2", color: "#b91c1c", fontWeight: "800", "& .MuiChip-icon": { color: "inherit" } }} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function UserPointHistory({ pointLogs, dailyScores }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1.5fr) minmax(280px, 1fr)" }, gap: 3 }}>
      <Box>
        {!pointLogs.length ? (
          <EmptyHistory icon={<History sx={{ fontSize: 52, mb: 1 }} />} title="ยังไม่มีประวัติการปรับคะแนน" description="คะแนนของผู้ใช้นี้ยังไม่เคยมีรายการเปลี่ยนแปลง" />
        ) : (
          <TableContainer sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: "#f8fafc" }}>
                  <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>วันเวลา</TableCell>
                  <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>เหตุผล</TableCell>
                  <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>การเปลี่ยนแปลง</TableCell>
                  <TableCell sx={{ fontWeight: "800", color: "#64748b" }}>คะแนนหลังรายการ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pointLogs.map((log) => (
                  <TableRow key={log.id} sx={{ "& td": { borderBottom: "1px solid #f1f5f9" } }}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDateTime(log.created_at)}</TableCell>
                    <TableCell sx={{ maxWidth: 260, overflowWrap: "anywhere" }}>
                      <Typography variant="body2" fontWeight="700" color="#334155">{getPointReason(log.reason)}</Typography>
                      <Typography variant="caption" color="#94a3b8">{log.note || "ไม่มีรายละเอียด"}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight="800" color={log.change < 0 ? "#ef4444" : "#10b981"}>
                        {log.change > 0 ? "+" : ""}{log.change}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ color: "#334155", fontWeight: "700" }}>{log.points_after ?? "—"}/100</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
      <Paper elevation={0} sx={{ border: "1px solid #e2e8f0", borderRadius: 3, alignSelf: "start", overflow: "hidden" }}>
        <Box sx={{ p: 2.5, borderBottom: "1px solid #f1f5f9" }}>
          <Typography fontWeight="800" color="#334155">คะแนนรายวัน</Typography>
          <Typography variant="caption" color="#94a3b8">ย้อนหลังไม่เกิน 100 รายการ</Typography>
        </Box>
        {!dailyScores.length ? (
          <Box sx={{ p: 3 }}><Typography variant="body2" color="#94a3b8">ยังไม่มีคะแนนรายวัน</Typography></Box>
        ) : (
          <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
            {dailyScores.map((row) => {
              const score = Math.max(0, Math.min(100, Number(row.score) || 0));
              return (
                <Box key={String(row.score_date)}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 0.6 }}>
                    <Typography variant="body2" color="#64748b">{formatDate(row.score_date)}</Typography>
                    <Typography variant="body2" fontWeight="800" color={getScoreColor(score)}>{score}/100</Typography>
                  </Box>
                  <LinearProgress variant="determinate" value={score} sx={{ height: 6, borderRadius: 4, bgcolor: "#f1f5f9", "& .MuiLinearProgress-bar": { bgcolor: getScoreColor(score), borderRadius: 4 } }} />
                </Box>
              );
            })}
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default function AdminUserDetailsDialog({
  open,
  onClose,
  selectedUser,
  detail,
  loading,
  error,
  tab,
  onTabChange,
}) {
  const profile = detail?.profile || selectedUser || {};
  const points = detail?.points || {};
  const summary = detail?.summary || {};
  const pointValue = Math.max(0, Math.min(100, Number(points.points) || 0));
  const dailyValue = Math.max(0, Math.min(100, Number(points.daily_score) || 0));
  const profileName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "ไม่ระบุชื่อ";
  const profileImage = getProfileImage(profile.profile_pic);
  const accountStatus = profile.account_status || "active";

  const tabs = [
    { label: "การจอง", count: summary.total_bookings ?? (detail?.bookings?.length || 0) },
    { label: "Session", count: summary.total_sessions ?? (detail?.sessions?.length || 0) },
    { label: "โปรแกรม", count: summary.total_program_usage ?? (detail?.program_usage?.length || 0) },
    { label: "ประวัติคะแนน", count: summary.total_point_events ?? (detail?.point_history?.length || 0) },
    { label: "การละเมิด", count: summary.total_violations ?? (detail?.violations?.length || 0) },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xl"
      scroll="paper"
      PaperProps={{ sx: { borderRadius: { xs: 0, sm: 4 }, minHeight: { sm: "min(760px, calc(100vh - 32px))" }, maxHeight: "calc(100vh - 16px)" } }}
    >
      <DialogTitle sx={{ p: { xs: 2.5, md: 4 }, pb: 2 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
            <Avatar src={profileImage || undefined} sx={{ bgcolor: stringToColor(profileName), width: 64, height: 64, fontSize: 22, fontWeight: "800", flexShrink: 0 }}>
              {getInitials(profile)}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h5" fontWeight="800" color="#1e293b" sx={{ overflowWrap: "anywhere" }}>
                {profileName}
              </Typography>
              <Typography variant="body2" color="#64748b" sx={{ overflowWrap: "anywhere" }}>
                {profile.email || "ไม่ระบุอีเมล"} · User ID #{profile.id || selectedUser?.user_id || "—"}
              </Typography>
              <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                <Chip label={getRoleLabel(profile.role)} size="small" sx={{ bgcolor: "#eff6ff", color: "#2563eb", fontWeight: "800" }} />
                <Chip label={accountStatus === "active" ? "บัญชีใช้งานได้" : "รอตรวจสอบ"} size="small" sx={{ bgcolor: accountStatus === "active" ? "#ecfdf5" : "#fff7ed", color: accountStatus === "active" ? "#047857" : "#c2410c", fontWeight: "800" }} />
              </Box>
            </Box>
          </Box>
          <IconButton onClick={onClose} aria-label="ปิดรายละเอียดผู้ใช้" sx={{ color: "#64748b" }}>
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers sx={{ p: { xs: 2.5, md: 4 }, bgcolor: "#fcfdfe" }}>
        {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>{error}</Alert>}

        {loading && !detail ? (
          <Box sx={{ minHeight: 420, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <CircularProgress />
          </Box>
        ) : detail ? (
          <>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" }, gap: 2.5, mb: 3 }}>
              <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: "1px solid #e2e8f0", bgcolor: "white" }}>
                <Typography variant="subtitle2" fontWeight="800" color="#64748b" sx={{ mb: 2 }}>ข้อมูลบัญชี</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 2 }}>
                  <ProfileField label="Student ID" value={profile.student_id} />
                  <ProfileField label="เบอร์โทรศัพท์" value={profile.phone} />
                  <ProfileField label="คณะ" value={profile.faculty} />
                  <ProfileField label="สาขา" value={profile.department} />
                  <ProfileField label="สร้างบัญชีเมื่อ" value={formatDateTime(profile.created_at)} />
                  <ProfileField label="อัปเดตล่าสุด" value={formatDateTime(profile.updated_at)} />
                </Box>
              </Paper>
              <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: "1px solid #e2e8f0", bgcolor: "white" }}>
                <Typography variant="subtitle2" fontWeight="800" color="#64748b" sx={{ mb: 2 }}>สถานะคะแนนและการใช้งาน</Typography>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 2 }}>
                  <Box><Typography variant="caption" color="#94a3b8">คะแนนสะสม</Typography><Typography variant="h5" fontWeight="800" color={getScoreColor(pointValue)}>{pointValue}/100</Typography></Box>
                  <Box><Typography variant="caption" color="#94a3b8">คะแนนวันนี้</Typography><Typography variant="h5" fontWeight="800" color="#2563eb">{dailyValue}/100</Typography></Box>
                  <Box><Typography variant="caption" color="#94a3b8">สิทธิ์การจอง</Typography><Box sx={{ mt: 0.6 }}><Chip icon={points.booking_allowed ? <CheckCircle /> : <Block />} label={points.booking_allowed ? "จองได้" : "จองไม่ได้"} size="small" sx={{ bgcolor: points.booking_allowed ? "#ecfdf5" : "#fef2f2", color: points.booking_allowed ? "#047857" : "#b91c1c", fontWeight: "800", "& .MuiChip-icon": { color: "inherit" } }} /></Box></Box>
                  <Box><Typography variant="caption" color="#94a3b8">ข้อมูลประวัติ</Typography><Typography variant="body2" color="#334155" fontWeight="700" sx={{ mt: 0.7 }}>{summary.total_sessions || 0} Session · {summary.total_bookings || 0} การจอง</Typography></Box>
                </Box>
              </Paper>
            </Box>

            <Paper elevation={0} sx={{ borderRadius: 3, border: "1px solid #e2e8f0", overflow: "hidden", bgcolor: "white" }}>
              <Tabs value={tab} onChange={onTabChange} variant="scrollable" scrollButtons="auto" sx={{ px: { xs: 1, md: 2 }, borderBottom: "1px solid #e2e8f0", "& .MuiTab-root": { textTransform: "none", fontWeight: "800", minHeight: 58 } }}>
                {tabs.map((item) => <Tab key={item.label} label={`${item.label} (${item.count})`} />)}
              </Tabs>
              <Box sx={{ p: { xs: 0, md: 1 } }}>
                {tab === 0 && <UserBookings rows={detail.bookings || []} />}
                {tab === 1 && <UserSessions rows={detail.sessions || []} />}
                {tab === 2 && <UserProgramUsage rows={detail.program_usage || []} />}
                {tab === 3 && <UserPointHistory pointLogs={detail.point_history || []} dailyScores={detail.daily_scores || []} />}
                {tab === 4 && <UserViolations rows={detail.violations || []} />}
              </Box>
            </Paper>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
