import fs from 'fs';
const path = 'components/Dashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

const replacement = `
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const activeIds = store.activeCompanies?.map((c: any) => c.id) || [];
      const { startDate, endDate } = getDateRange(dateRange);
      
      const summary = await reportingService.getDashboardSummary(
        activeIds.length === 1 ? activeIds[0] : 'CONSOLIDATED', 
        { startDate, endDate }
      );
      
      setReportData(summary);
    } catch (e) {
      console.error(e);
      // Fallback
      setReportData({});
    } finally {
      setLoading(false);
    }
  }, [store.activeCompanies, dateRange]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const todayCashIn = reportData?.total_inflow || reportData?.total_income || reportData?.todayCashIn || 0;
  const todayCashOut = reportData?.total_outflow || reportData?.total_expense || reportData?.todayCashOut || 0;
  const cashBalance = reportData?.cash_balance || reportData?.cashBalance || 0;
  const dueInstallments = reportData?.due_installments || reportData?.dueInstallments || [];
  
  const stats = [
    { label: 'Revenue Inflow', value: todayCashIn, bg: 'bg-emerald-50', color: 'text-emerald-600', icon: TrendingUp },
    { label: 'Expenses Outflow', value: todayCashOut, bg: 'bg-rose-50', color: 'text-rose-600', icon: TrendingDown },
    { label: 'Net Change', value: todayCashIn - todayCashOut, bg: 'bg-indigo-50', color: 'text-indigo-600', icon: Activity },
    { label: 'Total Liquidity', value: cashBalance, bg: 'bg-amber-50', color: 'text-amber-600', icon: Wallet }
  ];

  const handleFetchAdvice = async () => {
    setIsAnalyzing(true);
    try {
      const summaryText = \`Cash In: \${todayCashIn}, Cash Out: \${todayCashOut}, Balance: \${cashBalance}\`;
      const adv = await getFinancialAdvice(summaryText);
      setAdvice(adv || "Looking good. Maintain steady cash flow.");
    } catch (e) {
      setAdvice("Analysis unavailable at the moment.");
    } finally {
      setIsAnalyzing(false);
    }
  };
`;

content = content.replace(/  useEffect\(\(\) => \{\n    \/\/ Advanced migration logic removed from hook\n  \}, \[\]\);/, replacement);

fs.writeFileSync(path, content);
console.log('Restored state and functions');
