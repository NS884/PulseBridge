const state = {
  token: localStorage.getItem("patientPlatformToken") || "",
  email: localStorage.getItem("patientPlatformEmail") || "",
  patients: [],
};

const elements = {
  loginPanel: document.querySelector("#loginPanel"),
  appPanel: document.querySelector("#appPanel"),
  loginForm: document.querySelector("#loginForm"),
  patientForm: document.querySelector("#patientForm"),
  patientsTable: document.querySelector("#patientsTable"),
  searchInput: document.querySelector("#searchInput"),
  refreshButton: document.querySelector("#refreshButton"),
  resetFormButton: document.querySelector("#resetFormButton"),
  logoutButton: document.querySelector("#logoutButton"),
  sessionEmail: document.querySelector("#sessionEmail"),
  message: document.querySelector("#message"),
  authStatus: document.querySelector("#authStatus"),
  patientStatus: document.querySelector("#patientStatus"),
  gatewayStatus: document.querySelector("#gatewayStatus"),
  formTitle: document.querySelector("#formTitle"),
  patientId: document.querySelector("#patientId"),
  name: document.querySelector("#name"),
  patientEmail: document.querySelector("#patientEmail"),
  dateOfBirth: document.querySelector("#dateOfBirth"),
  registeredDate: document.querySelector("#registeredDate"),
  address: document.querySelector("#address"),
};

const today = new Date().toISOString().slice(0, 10);
elements.registeredDate.value = today;

function setMessage(text, type = "") {
  elements.message.textContent = text;
  elements.message.className = `message ${type}`.trim();
}

function setStatus(element, ok) {
  element.classList.remove("pending", "ok", "bad");
  element.classList.add(ok ? "ok" : "bad");
}

function authHeaders() {
  return {
    Authorization: `Bearer ${state.token}`,
  };
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(state.token ? authHeaders() : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status} ${response.statusText}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function syncSession() {
  const signedIn = Boolean(state.token);
  elements.loginPanel.classList.toggle("hidden", signedIn);
  elements.appPanel.classList.toggle("hidden", !signedIn);
  elements.sessionEmail.textContent = signedIn ? state.email : "Not signed in";
  elements.logoutButton.disabled = !signedIn;
}

function patientMatches(patient, query) {
  const haystack = `${patient.name} ${patient.email} ${patient.address} ${patient.dateOfBirth}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function renderPatients() {
  const query = elements.searchInput.value.trim();
  const patients = query
    ? state.patients.filter((patient) => patientMatches(patient, query))
    : state.patients;

  if (!patients.length) {
    elements.patientsTable.innerHTML = '<tr><td class="empty-row" colspan="5">No matching records</td></tr>';
    return;
  }

  elements.patientsTable.innerHTML = patients.map((patient) => `
    <tr>
      <td><strong>${escapeHtml(patient.name)}</strong></td>
      <td>${escapeHtml(patient.email)}</td>
      <td>${escapeHtml(patient.dateOfBirth)}</td>
      <td>${escapeHtml(patient.address)}</td>
      <td>
        <div class="row-actions">
          <button class="secondary-button" type="button" data-action="edit" data-id="${patient.id}">Edit</button>
          <button class="danger-button" type="button" data-action="delete" data-id="${patient.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadPatients() {
  setMessage("Loading patient records...");
  const patients = await request("/api/patients");
  state.patients = Array.isArray(patients) ? patients : [];
  renderPatients();
  setStatus(elements.patientStatus, true);
  setMessage(`${state.patients.length} patient records loaded.`, "success");
}

function fillForm(patient) {
  elements.patientId.value = patient.id;
  elements.name.value = patient.name;
  elements.patientEmail.value = patient.email;
  elements.dateOfBirth.value = patient.dateOfBirth;
  elements.registeredDate.value = today;
  elements.address.value = patient.address;
  elements.formTitle.textContent = "Edit Patient";
}

function resetForm() {
  elements.patientForm.reset();
  elements.patientId.value = "";
  elements.registeredDate.value = today;
  elements.formTitle.textContent = "New Patient";
}

function formPayload() {
  return {
    name: elements.name.value.trim(),
    email: elements.patientEmail.value.trim(),
    address: elements.address.value.trim(),
    dateOfBirth: elements.dateOfBirth.value,
    registeredDate: elements.registeredDate.value,
  };
}

async function checkGateway() {
  try {
    const response = await fetch("/api-docs/auth", { headers: { Accept: "application/json" } });
    setStatus(elements.gatewayStatus, response.ok);
  } catch {
    setStatus(elements.gatewayStatus, false);
  }
}

async function login(email, password) {
  const data = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    headers: {},
  });

  if (!data.token) {
    throw new Error("Token missing from login response");
  }

  state.token = data.token;
  state.email = email;
  localStorage.setItem("patientPlatformToken", state.token);
  localStorage.setItem("patientPlatformEmail", state.email);
  setStatus(elements.authStatus, true);
  syncSession();
  await loadPatients();
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("Signing in...");

  try {
    await login(
      elements.loginForm.email.value.trim(),
      elements.loginForm.password.value,
    );
  } catch (error) {
    setStatus(elements.authStatus, false);
    setMessage(`Sign in failed: ${error.message}`, "error");
  }
});

elements.patientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = elements.patientId.value;
  const payload = formPayload();

  try {
    if (id) {
      await request(`/api/patients/${id}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setMessage("Patient record updated.", "success");
    } else {
      await request("/api/patients", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setMessage("Patient record created.", "success");
    }

    resetForm();
    await loadPatients();
  } catch (error) {
    setMessage(`Save failed: ${error.message}`, "error");
  }
});

elements.patientsTable.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const patient = state.patients.find((item) => item.id === button.dataset.id);
  if (!patient) {
    return;
  }

  if (button.dataset.action === "edit") {
    fillForm(patient);
    elements.name.focus();
    return;
  }

  try {
    await request(`/api/patients/${patient.id}`, { method: "DELETE" });
    setMessage("Patient record deleted.", "success");
    await loadPatients();
  } catch (error) {
    setMessage(`Delete failed: ${error.message}`, "error");
  }
});

elements.searchInput.addEventListener("input", renderPatients);
elements.refreshButton.addEventListener("click", () => loadPatients().catch((error) => {
  setStatus(elements.patientStatus, false);
  setMessage(`Refresh failed: ${error.message}`, "error");
}));
elements.resetFormButton.addEventListener("click", resetForm);
elements.logoutButton.addEventListener("click", () => {
  state.token = "";
  state.email = "";
  state.patients = [];
  localStorage.removeItem("patientPlatformToken");
  localStorage.removeItem("patientPlatformEmail");
  syncSession();
  renderPatients();
  setMessage("Signed out.");
});

syncSession();
checkGateway();

if (state.token) {
  setStatus(elements.authStatus, true);
  loadPatients().catch((error) => {
    setStatus(elements.patientStatus, false);
    setMessage(`Session refresh failed: ${error.message}`, "error");
  });
}
