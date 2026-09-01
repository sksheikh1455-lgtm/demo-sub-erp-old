async function run() {
  const apiKey = process.env.VITE_SUPABASE_ANON_KEY;
  const bodyData = JSON.stringify({
    email: 'nonexistent-user-test@example.com',
    password: 'some-password-123'
  });

  console.log("1. Direct POST to Supabase signInWithPassword...");
  try {
    const start = Date.now();
    const res = await fetch('${process.env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apikey': apiKey
      },
      body: bodyData
    });
    console.log("Direct status:", res.status);
    console.log("Direct body:", await res.text());
    console.log("Direct took:", Date.now() - start, "ms");
  } catch (err: any) {
    console.error("Direct POST failed:", err.message);
  }
}
run();
