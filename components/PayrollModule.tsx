import React, { useState, useMemo, useEffect } from 'react';
import { 
  Users, 
  Calendar, 
  Clock, 
  FileText, 
  Plus, 
  CheckCircle2, 
  AlertCircle, 
  DollarSign,
  TrendingUp,
  Download,
  Printer,
  Search,
  Filter,
  ChevronRight,
  MoreHorizontal,
  ArrowRight,
  Target,
  Check,
  X,
  Minus,
  Star,
  Scan
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {formatBDT, getOpDateBST} from '../constants';
import { ContactType, SalaryComponentType, AttendanceRecord, LeaveRecord, Payslip, CommissionTarget, Holiday } from '../types';
import ColumnSelector, { useColumns, ColumnDef } from './ColumnSelector';
import FaceAttendance from './FaceAttendance';
import { Shield, Star as StarIcon, Info, AlertTriangle, Calendar as CalendarIcon } from 'lucide-react';

interface PayrollModuleProps {
  store: any;
}

const PayrollModule: React.FC<PayrollModuleProps> = ({ store }) => {
  const [activeView, setActiveView] = useState<'dashboard' | 'attendance' | 'leaves' | 'payslips' | 'commissions' | 'advances' | 'holidays'>('dashboard');
  const [showAttendanceModal, setShowAttendanceModal] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [showCommissionModal, setShowCommissionModal] = useState(false);
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [showFaceAuthModal, setShowFaceAuthModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
  const [attendanceCenterDate, setAttendanceCenterDate] = useState(() => getOpDateBST());
  
  const isAdmin = store.currentUser?.roleId === 'role-admin';
  const currentEmployee = useMemo(() => {
    return (store.employees || []).find((e: any) => e.assignedUserId === store.currentUser?.id);
  }, [store.employees, store.currentUser]);

  const [holidayData, setHolidayData] = useState<Omit<Holiday, 'id'>>({
    date: getOpDateBST(),
    name: '',
    type: 'PUBLIC',
    isWorkingDay: false,
    isImportantDay: false,
    companyId: store.activeCompanyIds[0]
  });

  useEffect(() => {
    if (store.fetchEmployees) {
      store.fetchEmployees();
    }
  }, []);

  // Auto-generate payslips on the 1st of the month
  useEffect(() => {
    if (isAdmin) {
      const today = new Date();
      if (today.getDate() === 1) {
        const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const prevMonth = prevMonthDate.toISOString().substring(0, 7);
        const hasPayslips = store.payslips?.some((p: any) => String(p.periodStart || '').startsWith(prevMonth) && p?.companyId === store.activeCompanyIds[0]);
        if (!hasPayslips) {
          store.autoGeneratePayslips(prevMonth, store.activeCompanyIds[0]);
        }
      }
    }
  }, [isAdmin, store.payslips, store.activeCompanyIds, store.autoGeneratePayslips]);

  const period = useMemo(() => {
    const parts = (selectedMonth || '').split('-');
    if (parts.length !== 2) return { start: '', end: '' };
    const [year, month] = parts.map(Number);
    if (isNaN(year) || isNaN(month)) return { start: '', end: '' };
    
    try {
      return {
        start: new Date(year, month - 1, 1).toISOString().split('T')[0],
        end: new Date(year, month, 0).toISOString().split('T')[0]
      };
    } catch (e) {
      return { start: '', end: '' };
    }
  }, [selectedMonth]);

  const [attendanceData, setAttendanceData] = useState<Omit<AttendanceRecord, 'id' | 'companyId'>>({
    employeeId: '',
    date: getOpDateBST(),
    status: 'PRESENT',
    overtimeHours: 0,
    lateMinutes: 0
  });

  const [leaveData, setLeaveData] = useState<Omit<LeaveRecord, 'id' | 'companyId'>>({
    employeeId: '',
    startDate: getOpDateBST(),
    endDate: getOpDateBST(),
    type: 'ANNUAL',
    status: 'PENDING',
    days: 1
  });

  const [commissionData, setCommissionData] = useState<Omit<CommissionTarget, 'id'>>({
    companyId: store.activeCompanyIds[0],
    type: 'GLOBAL',
    targetAmount: 0,
    commissionRate: 0,
    commissionType: 'GROSS_SALE',
    period: selectedMonth
  });

  const [advanceData, setAdvanceData] = useState({
    employeeId: '',
    date: getOpDateBST(),
    amount: 0,
    description: ''
  });

  const employees = useMemo(() => {
    if (isAdmin) return store.employees || [];
    return (store.employees || []).filter((e: any) => e.assignedUserId === store.currentUser?.id);
  }, [store.employees, isAdmin, store.currentUser]);

  const daysInMonth = useMemo(() => {
    const parts = (selectedMonth || '').split('-');
    if (parts.length !== 2) return 0;
    const [year, month] = parts.map(Number);
    if (isNaN(year) || isNaN(month)) return 0;
    
    const date = new Date(year, month, 0);
    return isNaN(date.getTime()) ? 0 : date.getDate();
  }, [selectedMonth]);

  const monthDates = useMemo(() => {
    if (daysInMonth === 0) return [];
    const dates = [];
    const [year, month] = selectedMonth.split('-').map(Number);
    for (let i = 1; i <= daysInMonth; i++) {
      try {
        dates.push(new Date(year, month - 1, i).toISOString().split('T')[0]);
      } catch (e) {
        // Skip invalid dates
      }
    }
    return dates;
  }, [selectedMonth, daysInMonth]);

  const attendanceDates = useMemo(() => {
    if (!attendanceCenterDate) return [];
    const center = new Date(attendanceCenterDate);
    if (isNaN(center.getTime())) return [];
    
    const dates = [];
    for (let i = -3; i <= 3; i++) {
      try {
        const d = new Date(center);
        d.setDate(center.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
      } catch (e) {
        // Skip invalid dates
      }
    }
    return dates;
  }, [attendanceCenterDate]);

  const [attendanceColumns, setAttendanceColumns] = useColumns('payroll_attendance_list', [
    { id: 'date', label: 'Date', visible: true },
    { id: 'employee', label: 'Employee', visible: true },
    { id: 'status', label: 'Status', visible: true },
    { id: 'overtime', label: 'Overtime', visible: true },
    { id: 'late', label: 'Late', visible: true },
  ]);

  const [leaveColumns, setLeaveColumns] = useColumns('payroll_leave_list', [
    { id: 'employee', label: 'Employee', visible: true },
    { id: 'type', label: 'Type', visible: true },
    { id: 'duration', label: 'Duration', visible: true },
    { id: 'status', label: 'Status', visible: true },
  ]);

  const [payslipColumns, setPayslipColumns] = useColumns('payroll_payslip_list', [
    { id: 'period', label: 'Period', visible: true },
    { id: 'employee', label: 'Employee', visible: true },
    { id: 'gross', label: 'Gross', visible: true },
    { id: 'deductions', label: 'Deductions', visible: true },
    { id: 'net', label: 'Net', visible: true },
    { id: 'status', label: 'Status', visible: true },
  ]);

  const [generatedPayslip, setGeneratedPayslip] = useState<any>(null);

  const handleCalculatePayslip = () => {
    if (!selectedEmployeeId) return alert("Select an employee");
    try {
      const ps = store.calculatePayslip(selectedEmployeeId, period.start, period.end);
      setGeneratedPayslip(ps);
    } catch (e: any) {
      alert(e.message);
    }
  };

  const stats = useMemo(() => {
    const totalPayroll = (store.payslips || []).reduce((sum: number, p: any) => sum + p.netSalary, 0);
    const activeEmployees = (store.employees || []).length;
    const pendingLeaves = (store.leaves || []).filter((l: any) => l.status === 'PENDING').length;
    
    return {
      totalPayroll,
      activeEmployees,
      pendingLeaves,
      avgSalary: activeEmployees > 0 ? totalPayroll / (store.payslips || []).length || 0 : 0
    };
  }, [store.payslips, store.employees, store.leaves]);

  const handlePostPayslip = () => {
    if (!generatedPayslip) return;
    try {
      store.postPayslip(generatedPayslip);
      setShowPayslipModal(false);
      setGeneratedPayslip(null);
      alert("Payslip posted and ledger entry created successfully.");
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-8 py-6 shrink-0">
        <div className="flex justify-between items-center max-w-7xl mx-auto w-full">
          <div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Payroll Management</h1>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.3em] mt-1">GAAP Compliant Human Capital Engine</p>
          </div>
          <div className="flex items-center space-x-3">
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-4 py-2 bg-slate-100 text-slate-900 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500/20"
            />
            <button 
              onClick={() => setShowFaceAuthModal(true)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all flex items-center space-x-2"
            >
              <Scan size={14} />
              <span>Smart Clock-In/Out</span>
            </button>
            {isAdmin && (
              <button 
                onClick={() => setShowHolidayModal(true)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Manage Holidays
              </button>
            )}
            {isAdmin && (
              <button 
                onClick={() => {
                  if (confirm(`Auto-generate draft payslips for ${selectedMonth}?`)) {
                    store.autoGeneratePayslips(selectedMonth, store.activeCompanyIds[0]);
                    alert("Draft payslips generated successfully.");
                  }
                }}
                className="px-4 py-2 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-100"
              >
                Auto-Generate Payslips
              </button>
            )}
            <button 
              onClick={() => setShowCommissionModal(true)}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              Set Commission
            </button>
            <button 
              onClick={() => setShowAdvanceModal(true)}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              Employee Advance
            </button>
            {isAdmin && (
              <button 
                onClick={() => setShowAttendanceModal(true)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Log Attendance
              </button>
            )}
            <button 
              onClick={() => setShowLeaveModal(true)}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              Request Leave
            </button>
            <button 
              onClick={() => setShowPayslipModal(true)}
              className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all active:scale-95"
            >
              Run Payroll
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b border-slate-100 px-8 shrink-0">
        <div className="flex space-x-8 max-w-7xl mx-auto">
          {[
            { id: 'dashboard', label: 'Overview', icon: TrendingUp },
            { id: 'attendance', label: 'Attendance', icon: Clock },
            { id: 'commissions', label: 'Commissions', icon: Target },
            { id: 'advances', label: 'Advances', icon: DollarSign },
            { id: 'leaves', label: 'Leaves', icon: Calendar },
            { id: 'payslips', label: 'Payslips', icon: FileText },
            isAdmin && { id: 'holidays', label: 'Holidays', icon: CalendarIcon }
          ].filter(Boolean).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id as any)}
              className={`flex items-center space-x-2 py-4 border-b-2 transition-all ${
                activeView === tab.id 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <tab.icon size={14} />
              <span className="text-[10px] font-black uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto space-y-8">
          {activeView === 'dashboard' && (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                  { label: 'Total Payroll', value: formatBDT(stats.totalPayroll), icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Active Employees', value: stats.activeEmployees, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                  { label: 'Pending Leaves', value: stats.pendingLeaves, icon: Calendar, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Avg. Net Salary', value: formatBDT(stats.avgSalary), icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' }
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                    <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center mb-4`}>
                      <stat.icon size={24} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                    <p className="text-xl font-black text-slate-900">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Recent Payslips */}
              <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Recent Payroll Runs</h3>
                  <button className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">View All</button>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                    <tr>
                      {payslipColumns.find(c => c.id === 'employee')?.visible && <th className="px-8 py-4">Employee</th>}
                      {payslipColumns.find(c => c.id === 'period')?.visible && <th className="px-8 py-4">Period</th>}
                      {payslipColumns.find(c => c.id === 'net')?.visible && <th className="px-8 py-4 text-right">Net Salary</th>}
                      {payslipColumns.find(c => c.id === 'status')?.visible && <th className="px-8 py-4 text-center">Status</th>}
                      <th className="px-8 py-4 text-right w-10">
                        <ColumnSelector columns={payslipColumns} onChange={setPayslipColumns} />
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(store.payslips || []).slice(-5).reverse().map((ps: Payslip) => {
                      const emp = (store.employees || []).find((e: any) => e.id === ps.employeeId);
                      return (
                        <tr key={ps.id} className="hover:bg-slate-50/50 transition-colors">
                          {payslipColumns.find(c => c.id === 'employee')?.visible && <td className="px-8 py-4">
                            <p className="text-sm font-black text-slate-800">{emp?.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{ps.number}</p>
                          </td>}
                          {payslipColumns.find(c => c.id === 'period')?.visible && <td className="px-8 py-4 text-xs font-bold text-slate-500">
                            {ps.periodStart} - {ps.periodEnd}
                          </td>}
                          {payslipColumns.find(c => c.id === 'net')?.visible && <td className="px-8 py-4 text-right text-sm font-black text-slate-900">
                            {formatBDT(ps.netSalary)}
                          </td>}
                          {payslipColumns.find(c => c.id === 'status')?.visible && <td className="px-8 py-4 text-center">
                            <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase rounded-full ring-1 ring-emerald-100">
                              {ps.status}
                            </span>
                          </td>}
                          <td className="px-8 py-4 text-right">
                            <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
                              <Printer size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeView === 'attendance' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Smart Attendance</h3>
                <div className="flex items-center space-x-4">
                  <button 
                    onClick={() => {
                      if (!attendanceCenterDate) return;
                      const d = new Date(attendanceCenterDate);
                      if (isNaN(d.getTime())) return;
                      d.setDate(d.getDate() - 7);
                      setAttendanceCenterDate(d.toISOString().split('T')[0]);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-600 bg-white rounded-lg shadow-sm border border-slate-100"
                  >
                    ← Prev Week
                  </button>
                  <input 
                    type="date" 
                    value={attendanceCenterDate}
                    onChange={(e) => setAttendanceCenterDate(e.target.value)}
                    className="px-4 py-2 bg-white border border-slate-200 text-slate-900 rounded-xl text-xs font-black uppercase tracking-widest outline-none focus:ring-2 ring-indigo-500/20"
                  />
                  <button 
                    onClick={() => setAttendanceCenterDate(getOpDateBST())}
                    className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-100"
                  >
                    Today
                  </button>
                  <button 
                    onClick={() => {
                      if (!attendanceCenterDate) return;
                      const d = new Date(attendanceCenterDate);
                      if (isNaN(d.getTime())) return;
                      d.setDate(d.getDate() + 7);
                      setAttendanceCenterDate(d.toISOString().split('T')[0]);
                    }}
                    className="p-2 text-slate-400 hover:text-slate-600 bg-white rounded-lg shadow-sm border border-slate-100"
                  >
                    Next Week →
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/50 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b">
                    <tr>
                      <th className="px-6 py-4 sticky left-0 bg-slate-50 z-10 min-w-[200px] border-r">Employee</th>
                      {attendanceDates.map(date => {
                        const d = new Date(date);
                        const isWeekend = d.getDay() === 6; // Saturday as default weekly holiday
                        const holiday = store.allHolidays?.find((h: any) => h.date === date && h?.companyId === store.activeCompanyIds[0]);
                        const isWorkingDay = holiday ? holiday.isWorkingDay : !isWeekend;
                        const isImportant = holiday?.isImportantDay;
                        const isCenter = date === attendanceCenterDate;
                        return (
                          <th 
                            key={date} 
                            className={`px-2 py-4 text-center min-w-[80px] border-r cursor-pointer transition-colors ${isCenter ? 'bg-indigo-50/50' : !isWorkingDay ? 'bg-slate-100/50' : 'hover:bg-slate-50'} ${isImportant ? 'bg-amber-50 text-amber-600' : ''}`}
                            onClick={() => {
                              if (!isAdmin) return;
                              // Toggle important day for all employees on this date
                              const firstEmp = employees[0];
                              if (firstEmp) {
                                const current = store.attendance?.find((a: any) => a.date === date && a.employeeId === firstEmp.id);
                                store.addAttendance({
                                  employeeId: firstEmp.id,
                                  date,
                                  status: current?.status || 'PRESENT',
                                  overtimeHours: current?.overtimeHours || 0,
                                  lateMinutes: current?.lateMinutes || 0,
                                  isImportantDay: !isImportant
                                });
                              }
                            }}
                          >
                            <div className={`flex flex-col items-center ${isCenter ? 'scale-110 transform transition-transform' : ''}`}>
                              <span className={`${isCenter ? 'text-2xl text-indigo-600' : 'text-sm'} font-black`}>{d.getDate()}</span>
                              <span className={`${isCenter ? 'text-indigo-400 font-bold' : 'opacity-50'}`}>{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}</span>
                              {isImportant && <StarIcon size={isCenter ? 12 : 8} className={`mt-1 fill-amber-400 text-amber-400`} />}
                              {!isWorkingDay && <span className="text-[8px] font-black text-slate-400 mt-1">HOLIDAY</span>}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {employees.map((emp: any) => (
                      <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 sticky left-0 bg-white z-10 font-black text-slate-800 text-xs border-r shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                          {emp.name}
                        </td>
                        {attendanceDates.map(date => {
                          const record = store.attendance?.find((a: any) => a.employeeId === emp.id && a.date === date);
                          const status = record?.status || 'ABSENT';
                          const isImportant = record?.isImportantDay;
                          const isCenter = date === attendanceCenterDate;
                          
                          return (
                            <td 
                              key={date} 
                              className={`px-1 py-4 text-center border-r group relative ${isCenter ? 'bg-indigo-50/10' : ''} ${isImportant ? 'bg-amber-50/30' : ''}`}
                            >
                              <div className="flex flex-col items-center justify-center space-y-1">
                                <button 
                                  onClick={() => {
                                    if (!isAdmin) return;
                                    let nextStatus: any = 'PRESENT';
                                    if (status === 'PRESENT') nextStatus = 'HALF_DAY';
                                    else if (status === 'HALF_DAY') nextStatus = 'ABSENT';
                                    else nextStatus = 'PRESENT';
                                    
                                    store.addAttendance({
                                      employeeId: emp.id,
                                      date,
                                      status: nextStatus,
                                      overtimeHours: record?.overtimeHours || 0,
                                      lateMinutes: record?.lateMinutes || 0,
                                      isImportantDay: isImportant
                                    });
                                  }}
                                  disabled={!isAdmin}
                                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                                    status === 'PRESENT' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' :
                                    status === 'HALF_DAY' ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' :
                                    'bg-slate-100 text-slate-400 hover:bg-slate-200'
                                  } ${isCenter ? 'ring-2 ring-indigo-500/20 ring-offset-1' : ''} ${!isAdmin ? 'cursor-default opacity-80' : ''}`}
                                >
                                  {status === 'PRESENT' ? <Check size={16} strokeWidth={3} /> : 
                                   status === 'HALF_DAY' ? <Minus size={16} strokeWidth={3} /> : 
                                   <X size={16} strokeWidth={3} />}
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-6 bg-slate-50 border-t flex items-center space-x-6 text-[10px] font-black uppercase tracking-widest text-slate-400">
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-emerald-100 text-emerald-700 rounded flex items-center justify-center"><Check size={10} strokeWidth={3} /></div>
                  <span>Present (✓)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-amber-100 text-amber-700 rounded flex items-center justify-center"><Minus size={10} strokeWidth={3} /></div>
                  <span>Half Day (—)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 bg-slate-100 text-slate-400 rounded flex items-center justify-center"><X size={10} strokeWidth={3} /></div>
                  <span>Absent (❌)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Star size={12} className="fill-amber-400 text-amber-400" />
                  <span>Important Day (2x Penalty)</span>
                </div>
              </div>
            </div>
          )}

          {activeView === 'holidays' && isAdmin && (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Holiday Management</h3>
                <button 
                  onClick={() => {
                    setHolidayData({
                      date: getOpDateBST(),
                      name: '',
                      type: 'PUBLIC',
                      isWorkingDay: false,
                      isImportantDay: false,
                      companyId: store.activeCompanyIds[0]
                    });
                    setShowHolidayModal(true);
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all"
                >
                  Add Holiday Override
                </button>
              </div>
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {store.allHolidays?.filter((h: any) => h?.companyId === store.activeCompanyIds[0]).map((h: any) => (
                    <div key={h.id} className="p-6 bg-slate-50 rounded-2xl border border-slate-100 relative group">
                      <button 
                        onClick={() => store.deleteHoliday(h.id)}
                        className="absolute top-4 right-4 p-2 text-slate-300 hover:text-rose-500 opacity-100 transition-opacity transition-all"
                      >
                        <X size={16} />
                      </button>
                      <div className="flex items-center space-x-3 mb-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${h.isWorkingDay ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                          <CalendarIcon size={20} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-800">{h.name}</p>
                          <p className="text-[10px] font-bold text-slate-400">{h.date}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2 py-1 bg-white border border-slate-200 text-[8px] font-black uppercase rounded-lg">
                          {h.type}
                        </span>
                        {h.isWorkingDay && (
                          <span className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[8px] font-black uppercase rounded-lg">
                            Working Day
                          </span>
                        )}
                        {h.isImportantDay && (
                          <span className="px-2 py-1 bg-amber-50 text-amber-600 text-[8px] font-black uppercase rounded-lg flex items-center space-x-1">
                            <StarIcon size={8} className="fill-amber-600" />
                            <span>Important Day</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {(!store.allHolidays || store.allHolidays.length === 0) && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 bg-slate-50 text-slate-200 rounded-full flex items-center justify-center mx-auto mb-4">
                      <CalendarIcon size={32} />
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">No holiday overrides defined</p>
                    <p className="text-[10px] text-slate-300 mt-1">Saturdays are marked as holidays by default.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === 'commissions' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {store.allCommissionTargets?.filter((t: any) => t?.companyId === store.activeCompanyIds[0] && t.period === selectedMonth).map((tgt: any) => (
                  <div key={tgt.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm relative group">
                    <button 
                      onClick={() => store.deleteCommissionTarget(tgt.id)}
                      className="absolute top-4 right-4 p-2 text-slate-300 hover:text-rose-500 opacity-100 transition-opacity transition-all"
                    >
                      <X size={16} />
                    </button>
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4">
                      <Target size={24} />
                    </div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                      {tgt.type} Target ({tgt.commissionType === 'GROSS_SALE' ? 'Gross' : 'Profit'})
                    </p>
                    <h4 className="text-lg font-black text-slate-900 mb-2">
                      {tgt.type === 'GLOBAL' ? 'Global Sales' : tgt.targetId}
                    </h4>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Target Amount</p>
                        <p className="text-sm font-black text-slate-700">{formatBDT(tgt.targetAmount)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Commission</p>
                        <p className="text-sm font-black text-indigo-600">{tgt.commissionRate}%</p>
                      </div>
                    </div>
                  </div>
                ))}
                <button 
                  onClick={() => setShowCommissionModal(true)}
                  className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] p-6 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group"
                >
                  <Plus size={32} className="mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Add New Target</span>
                </button>
              </div>
            </div>
          )}

          {activeView === 'leaves' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                  <tr>
                    {leaveColumns.find(c => c.id === 'employee')?.visible && <th className="px-8 py-4">Employee</th>}
                    {leaveColumns.find(c => c.id === 'type')?.visible && <th className="px-8 py-4">Type</th>}
                    {leaveColumns.find(c => c.id === 'duration')?.visible && <th className="px-8 py-4">Duration</th>}
                    {leaveColumns.find(c => c.id === 'status')?.visible && <th className="px-8 py-4 text-center">Status</th>}
                    <th className="px-8 py-4 text-right w-10">
                      <ColumnSelector columns={leaveColumns} onChange={setLeaveColumns} />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {(store.leaves || []).slice().reverse().map((l: LeaveRecord) => {
                    const emp = (store.employees || []).find((e: any) => e.id === l.employeeId);
                    return (
                      <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                        {leaveColumns.find(c => c.id === 'employee')?.visible && <td className="px-8 py-4">
                          <p className="text-sm font-black text-slate-800">{emp?.name}</p>
                        </td>}
                        {leaveColumns.find(c => c.id === 'type')?.visible && <td className="px-8 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">{l.type}</td>}
                        {leaveColumns.find(c => c.id === 'duration')?.visible && <td className="px-8 py-4 text-xs font-bold text-slate-500">
                          {l.startDate} to {l.endDate} ({l.days} days)
                        </td>}
                        {leaveColumns.find(c => c.id === 'status')?.visible && <td className="px-8 py-4 text-center">
                          <span className={`px-3 py-1 text-[9px] font-black uppercase rounded-full ring-1 ${
                            l.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' :
                            l.status === 'REJECTED' ? 'bg-rose-50 text-rose-700 ring-rose-100' :
                            'bg-amber-50 text-amber-700 ring-amber-100'
                          }`}>
                            {l.status}
                          </span>
                        </td>}
                        <td className="px-8 py-4 text-right">
                          {l.status === 'PENDING' && (
                            <div className="flex justify-end space-x-2">
                              <button className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><CheckCircle2 size={16} /></button>
                              <button className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><AlertCircle size={16} /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {activeView === 'payslips' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Monthly Payroll Summary Sheet</h3>
                <div className="flex space-x-3">
                  <button 
                    onClick={() => {
                      employees.forEach(emp => {
                        try {
                          const ps = store.calculatePayslip(emp.id, period.start, period.end);
                          store.postPayslip(ps);
                        } catch (e) {
                          console.error(`Failed to generate payslip for ${emp.name}`, e);
                        }
                      });
                      alert("Batch payroll run completed for all employees.");
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all"
                  >
                    Generate All Payslips
                  </button>
                  <button className="p-2 bg-white border border-slate-200 text-slate-400 hover:text-slate-600 rounded-xl transition-all">
                    <Download size={16} />
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b">
                    <tr>
                      <th className="px-8 py-4">Employee</th>
                      <th className="px-8 py-4 text-center">P / A / H</th>
                      <th className="px-8 py-4 text-right">Basic</th>
                      <th className="px-8 py-4 text-right">Earnings</th>
                      <th className="px-8 py-4 text-right">Commission</th>
                      <th className="px-8 py-4 text-right">Deductions</th>
                      <th className="px-8 py-4 text-right">Advance</th>
                      <th className="px-8 py-4 text-right">Net Salary</th>
                      <th className="px-8 py-4 text-center">Status</th>
                      <th className="px-8 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {employees.map((emp: any) => {
                      const ps = (store.payslips || []).find((p: any) => p.employeeId === emp.id && p.periodStart === period.start);
                      const draftPs = !ps ? store.calculatePayslip(emp.id, period.start, period.end) : null;
                      const data = ps || draftPs;
                      
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-8 py-4">
                            <p className="text-sm font-black text-slate-800">{emp.name}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">{emp.externalId || 'EMP-ID'}</p>
                          </td>
                          <td className="px-8 py-4 text-center text-[10px] font-black text-slate-500">
                            <span className="text-emerald-600">{data.attendanceSummary.present}</span> / 
                            <span className="text-rose-600">{data.attendanceSummary.absent}</span> / 
                            <span className="text-amber-600">{data.attendanceSummary.halfDay}</span>
                          </td>
                          <td className="px-8 py-4 text-right text-xs font-bold text-slate-600">{formatBDT(data.basicSalary)}</td>
                          <td className="px-8 py-4 text-right text-xs font-bold text-emerald-600">+{formatBDT(data.earnings.reduce((s: any, e: any) => s + e.amount, 0))}</td>
                          <td className="px-8 py-4 text-right text-xs font-bold text-indigo-600">+{formatBDT(data.commission || 0)}</td>
                          <td className="px-8 py-4 text-right text-xs font-bold text-rose-600">-{formatBDT(data.deductions.reduce((s: any, d: any) => s + d.amount, 0))}</td>
                          <td className="px-8 py-4 text-right text-xs font-bold text-rose-800">-{formatBDT(data.advanceDeduction || 0)}</td>
                          <td className="px-8 py-4 text-right text-sm font-black text-slate-900">{formatBDT(data.netSalary)}</td>
                          <td className="px-8 py-4 text-center">
                            <span className={`px-3 py-1 text-[9px] font-black uppercase rounded-full ring-1 ${
                              ps ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-slate-100 text-slate-400 ring-slate-200'
                            }`}>
                              {ps ? 'Posted' : 'Draft'}
                            </span>
                          </td>
                          <td className="px-8 py-4 text-right">
                            {!ps ? (
                              <button 
                                onClick={() => store.postPayslip(data)}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            ) : (
                              <button className="p-2 text-slate-400 hover:text-slate-600 transition-all">
                                <Printer size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeView === 'advances' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {employees.map((emp: any) => {
                  const empAdvances = (store.allAdvanceSalaries || []).filter((a: any) => a.employeeId === emp.id && a.status === 'POSTED');
                  const totalTaken = empAdvances.reduce((sum: number, a: any) => sum + a.amount, 0);
                  const empPayslips = (store.payslips || []).filter((p: any) => p.employeeId === emp.id && p.status === 'POSTED');
                  const totalDeducted = empPayslips.reduce((sum: number, p: any) => sum + (p.advanceDeduction || 0), 0);
                  const balance = totalTaken - totalDeducted;

                  return (
                    <div key={emp.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
                          <Users size={24} />
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Advance Balance</p>
                          <p className={`text-sm font-black ${balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatBDT(balance)}</p>
                        </div>
                      </div>
                      <h4 className="text-sm font-black text-slate-800 mb-4">{emp.name}</h4>
                      <div className="space-y-2">
                        <div className="flex justify-between text-[10px] font-bold">
                          <span className="text-slate-400 uppercase">Total Taken</span>
                          <span className="text-slate-700">{formatBDT(totalTaken)}</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-bold">
                          <span className="text-slate-400 uppercase">Total Deducted</span>
                          <span className="text-slate-700">{formatBDT(totalDeducted)}</span>
                        </div>
                      </div>
                      <button 
                        onClick={() => {
                          setAdvanceData({ ...advanceData, employeeId: emp.id });
                          setShowAdvanceModal(true);
                        }}
                        className="w-full mt-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all"
                      >
                        Give Advance
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Advance Transaction History</h3>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b">
                    <tr>
                      <th className="px-8 py-4">Date</th>
                      <th className="px-8 py-4">Employee</th>
                      <th className="px-8 py-4">Description</th>
                      <th className="px-8 py-4 text-right">Amount</th>
                      <th className="px-8 py-4 text-center">Status</th>
                      <th className="px-8 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(store.allAdvanceSalaries || []).slice().reverse().map((adv: any) => {
                      const emp = employees.find((e: any) => e.id === adv.employeeId);
                      return (
                        <tr key={adv.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-8 py-4 text-xs font-bold text-slate-500">{adv.date}</td>
                          <td className="px-8 py-4">
                            <p className="text-sm font-black text-slate-800">{emp?.name}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">{adv.number}</p>
                          </td>
                          <td className="px-8 py-4 text-xs text-slate-600">{adv.description || 'Employee Advance'}</td>
                          <td className="px-8 py-4 text-right text-sm font-black text-slate-900">{formatBDT(adv.amount)}</td>
                          <td className="px-8 py-4 text-center">
                            <span className={`px-3 py-1 text-[9px] font-black uppercase rounded-full ring-1 ${
                              adv.status === 'POSTED' ? 'bg-emerald-50 text-emerald-700 ring-emerald-100' : 'bg-slate-100 text-slate-400 ring-slate-200'
                            }`}>
                              {adv.status}
                            </span>
                          </td>
                          <td className="px-8 py-4 text-right">
                            {adv.status === 'DRAFT' && (
                              <button 
                                onClick={async () => {
                                  await store.postAdvanceSalary(adv.id);
                                  alert("Advance posted to ledger.");
                                }}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Attendance Modal */}
      {showAttendanceModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Log Attendance</h3>
              <button onClick={() => setShowAttendanceModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Employee</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                  value={attendanceData.employeeId || ""}
                  onChange={e => setAttendanceData({...attendanceData, employeeId: e.target.value})}
                >
                  <option value="">Select Employee</option>
                  {(store.employees || []).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Date</label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    value={attendanceData.date}
                    onChange={e => setAttendanceData({...attendanceData, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Status</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    value={attendanceData.status || ""}
                    onChange={e => setAttendanceData({...attendanceData, status: e.target.value as any})}
                  >
                    <option value="PRESENT">Present</option>
                    <option value="ABSENT">Absent</option>
                    <option value="LATE">Late</option>
                    <option value="LEAVE">Leave</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">OT Hours</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    value={attendanceData.overtimeHours}
                    onChange={e => setAttendanceData({...attendanceData, overtimeHours: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Late (Min)</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    value={attendanceData.lateMinutes}
                    onChange={e => setAttendanceData({...attendanceData, lateMinutes: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>
              <button 
                onClick={() => {
                  if (!attendanceData.employeeId) return alert("Select employee");
                  store.addAttendance(attendanceData);
                  setShowAttendanceModal(false);
                }}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"
              >
                Save Attendance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payslip Generation Modal */}
      {showPayslipModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-4xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Run Payroll Engine</h3>
              <button onClick={() => setShowPayslipModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Select Employee</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    value={selectedEmployeeId || ''}
                    onChange={e => setSelectedEmployeeId(e.target.value)}
                  >
                    <option value="">Choose Employee...</option>
                    {(store.employees || []).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Period Start</label>
                  <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-500">
                    {period.start}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Period End</label>
                  <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-500">
                    {period.end}
                  </div>
                </div>
              </div>

              <div className="flex justify-center mb-12">
                <button 
                  onClick={handleCalculatePayslip}
                  className="px-12 py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 shadow-2xl transition-all flex items-center"
                >
                  <TrendingUp size={16} className="mr-2 text-indigo-400" />
                  Calculate Earnings & Deductions
                </button>
              </div>

              {generatedPayslip && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-50 rounded-[2.5rem] p-10 border border-slate-200"
                >
                  <div className="flex justify-between items-start mb-10">
                    <div>
                      <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Draft Payslip</h4>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                        {(store.employees || []).find((e: any) => e.id === generatedPayslip.employeeId)?.name} • {generatedPayslip.periodStart} to {generatedPayslip.periodEnd}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Payable</p>
                      <p className="text-3xl font-black text-indigo-600">{formatBDT(generatedPayslip.netSalary)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div>
                      <h5 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200 flex items-center">
                        <ArrowRight size={12} className="mr-2 text-emerald-500" />
                        Earnings & Allowances
                      </h5>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="font-bold text-slate-600">Basic Salary</span>
                          <span className="font-black text-slate-900">{formatBDT(generatedPayslip.basicSalary)}</span>
                        </div>
                        {generatedPayslip.earnings.map((e: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="font-bold text-slate-600">{e.name}</span>
                            <span className="font-black text-slate-900">{formatBDT(e.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h5 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-4 pb-2 border-b border-slate-200 flex items-center">
                        <ArrowRight size={12} className="mr-2 text-rose-500" />
                        Deductions & Recoveries
                      </h5>
                      <div className="space-y-3">
                        {generatedPayslip.deductions.map((d: any, i: number) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="font-bold text-slate-600">{d.name}</span>
                            <span className="font-black text-rose-600">({formatBDT(d.amount)})</span>
                          </div>
                        ))}
                        {generatedPayslip.deductions.length === 0 && (
                          <p className="text-xs italic text-slate-400">No deductions recorded for this period.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-10 pt-10 border-t border-slate-200 grid grid-cols-4 gap-4">
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Present</p>
                      <p className="text-lg font-black text-slate-800">{generatedPayslip.attendanceSummary.present}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Absent</p>
                      <p className="text-lg font-black text-slate-800">{generatedPayslip.attendanceSummary.absent}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Late</p>
                      <p className="text-lg font-black text-slate-800">{generatedPayslip.attendanceSummary.late}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">OT Hours</p>
                      <p className="text-lg font-black text-slate-800">{generatedPayslip.attendanceSummary.overtimeHours}h</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="p-8 bg-slate-900 flex justify-between items-center shrink-0">
              <button onClick={() => setShowPayslipModal(false)} className="text-white/40 font-black text-[10px] uppercase tracking-widest hover:text-white transition-colors">Cancel Run</button>
              <button 
                disabled={!generatedPayslip}
                onClick={handlePostPayslip}
                className={`px-12 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${
                  generatedPayslip 
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xl shadow-indigo-900/20' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                Post to Ledger & Finalize
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Commission Modal */}
      {showCommissionModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Set Commission Target</h3>
              <button onClick={() => setShowCommissionModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Target Type</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                  value={commissionData.type || ""}
                  onChange={e => setCommissionData({...commissionData, type: e.target.value as any, targetId: ''})}
                >
                  <option value="GLOBAL">Global Sales</option>
                  <option value="PRODUCT">Product Wise</option>
                  <option value="BRAND">Brand Wise</option>
                  <option value="CATEGORY">Category Wise</option>
                </select>
              </div>

              {commissionData.type !== 'GLOBAL' && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">
                    Select {commissionData.type === 'PRODUCT' ? 'Product' : commissionData.type === 'BRAND' ? 'Brand' : 'Category'}
                  </label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    value={commissionData.targetId || ''}
                    onChange={e => setCommissionData({...commissionData, targetId: e.target.value})}
                  >
                    <option value="">Select...</option>
                    {commissionData.type === 'PRODUCT' && (store.products || []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    {commissionData.type === 'BRAND' && (store.allBrands || []).map((b: any) => <option key={b.name} value={b.name}>{b.name}</option>)}
                    {commissionData.type === 'CATEGORY' && (store.allCategories || []).map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Target Amount</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    value={commissionData.targetAmount || ''}
                    onChange={e => setCommissionData({...commissionData, targetAmount: parseFloat(e.target.value) || 0})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Comm. Rate (%)</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    value={commissionData.commissionRate || ''}
                    onChange={e => setCommissionData({...commissionData, commissionRate: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Commission On</label>
                <div className="flex space-x-4">
                  {['GROSS_SALE', 'PROFIT'].map(type => (
                    <button
                      key={type}
                      onClick={() => setCommissionData({...commissionData, commissionType: type as any})}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                        commissionData.commissionType === type 
                        ? 'bg-indigo-600 text-white border-indigo-600' 
                        : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-200'
                      }`}
                    >
                      {type.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <button 
                onClick={() => {
                  if (commissionData.type !== 'GLOBAL' && !commissionData.targetId) return alert("Select target item");
                  store.addCommissionTarget(commissionData);
                  setShowCommissionModal(false);
                }}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"
              >
                Create Target
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advance Modal */}
      {showAdvanceModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Record Employee Advance</h3>
              <button onClick={() => setShowAdvanceModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Employee</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                  value={advanceData.employeeId || ""}
                  onChange={e => setAdvanceData({...advanceData, employeeId: e.target.value})}
                >
                  <option value="">Select Employee</option>
                  {(store.employees || []).map((e: any) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Date</label>
                  <input 
                    type="date" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    value={advanceData.date}
                    onChange={e => setAdvanceData({...advanceData, date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Amount (৳)</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    value={advanceData.amount || ''}
                    onChange={e => setAdvanceData({...advanceData, amount: parseFloat(e.target.value) || 0})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Description</label>
                <textarea 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                  placeholder="e.g. Medical emergency advance"
                  value={advanceData.description}
                  onChange={e => setAdvanceData({...advanceData, description: e.target.value})}
                />
              </div>
              <button 
                onClick={async () => {
                  try {
                    if (!advanceData.employeeId || !advanceData.amount) return alert("Select employee and enter amount");
                    const adv = await store.addAdvanceSalary(advanceData);
                    await store.postAdvanceSalary(adv.id);
                    setShowAdvanceModal(false);
                    setAdvanceData({
                      employeeId: '',
                      date: getOpDateBST(),
                      amount: 0,
                      description: ''
                    });
                    alert("Advance recorded and posted successfully.");
                  } catch (err: any) {
                    alert(`Failed to create or post advance salary: ${err.message}`);
                  }
                }}
                className="w-full py-4 bg-rose-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-rose-700 shadow-xl shadow-rose-100 transition-all"
              >
                Record & Post Advance
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Holiday Modal */}
      {showHolidayModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Holiday Override</h3>
              <button onClick={() => setShowHolidayModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Date</label>
                <input 
                  type="date" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                  value={holidayData.date}
                  onChange={e => setHolidayData({...holidayData, date: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Event Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Eid-ul-Fitr, Annual Picnic"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                  value={holidayData.name}
                  onChange={e => setHolidayData({...holidayData, name: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Type</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/20"
                    value={holidayData.type || ""}
                    onChange={e => setHolidayData({...holidayData, type: e.target.value as any})}
                  >
                    <option value="PUBLIC">Public Holiday</option>
                    <option value="WEEKLY">Weekly Override</option>
                    <option value="EVENT">Special Event</option>
                  </select>
                </div>
                <div className="flex flex-col justify-end">
                  <label className="flex items-center space-x-3 cursor-pointer p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      checked={holidayData.isWorkingDay}
                      onChange={e => setHolidayData({...holidayData, isWorkingDay: e.target.checked})}
                    />
                    <span className="text-[10px] font-black text-slate-600 uppercase">Working Day</span>
                  </label>
                </div>
              </div>

              <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
                    checked={holidayData.isImportantDay}
                    onChange={e => setHolidayData({...holidayData, isImportantDay: e.target.checked})}
                  />
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-amber-800 uppercase flex items-center space-x-1">
                      <StarIcon size={10} className="fill-amber-600" />
                      <span>Important Day (SAP Penalty Logic)</span>
                    </p>
                    <p className="text-[8px] text-amber-600 font-bold mt-0.5">Absence triggers 2x salary deduction. Attendance triggers 2x salary reward.</p>
                  </div>
                </label>
              </div>

              <button 
                onClick={() => {
                  if (!holidayData.name) return alert("Enter event name");
                  store.addHoliday(holidayData);
                  setShowHolidayModal(false);
                }}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 shadow-xl shadow-slate-100 transition-all"
              >
                Save Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Face Auth Modal */}
      {showFaceAuthModal && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-2xl">
            <div className="flex justify-end mb-4">
              <button 
                onClick={() => setShowFaceAuthModal(false)}
                className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md transition-all"
              >
                <X size={24} />
              </button>
            </div>
            <FaceAttendance 
              store={store} 
              mode="auth" 
              onComplete={() => setShowFaceAuthModal(false)} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollModule;
