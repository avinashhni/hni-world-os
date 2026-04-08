async function legalnomicsSignUp(email, password, fullName, role = "public_user") {
  const sb = window.legalnomicsSupabase;
  if (!sb) {
    alert("Supabase is not configured.");
    return null;
  }

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName || "",
        role
      }
    }
  });

  if (error) {
    alert(error.message);
    return null;
  }

  alert("Signup successful. Check email if confirmation is enabled.");
  return data;
}

async function legalnomicsSignIn(email, password) {
  const sb = window.legalnomicsSupabase;
  if (!sb) {
    alert("Supabase is not configured.");
    return null;
  }

  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    alert(error.message);
    return null;
  }

  alert("Login successful.");
  return data;
}

async function legalnomicsSignOut() {
  const sb = window.legalnomicsSupabase;
  if (!sb) return;
  await sb.auth.signOut();
  alert("Signed out.");
}
