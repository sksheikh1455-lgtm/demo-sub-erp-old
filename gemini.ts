export async function getFinancialAdvice(summary: string): Promise<string> {
  try {
    const res = await fetch("/api/gemini/advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary })
    });
    if (!res.ok) {
      const data = await res.json();
      return data.error || "Could not generate advice.";
    }
    const data = await res.json();
    return data.text;
  } catch (error) {
    console.error("Error getting financial advice:", error);
    return "Could not generate advice at this time.";
  }
}

export async function categorizeTransaction(description: string, accounts: any[]): Promise<{ accountId: string; reasoning?: string } | null> {
  try {
    const res = await fetch("/api/gemini/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, accounts })
    });
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    return data;
  } catch (error) {
    console.error("Error categorizing transaction:", error);
    return null;
  }
}
