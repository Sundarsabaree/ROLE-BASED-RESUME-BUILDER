const RESUME_STORAGE_KEY = "resumeData";
const GOOGLE_AI_STUDIO_API_KEY = "AIzaSyB8k-5QYVFsfETCMd_kYyNSeC9FmwsFbSc"; // Replace with your Google AI Studio API key in production
const GOOGLE_AI_MODEL = "gemini-1.5-flash";
const ATS_MATCH_KEY = "atsMatch";

function getInputValue(fieldId) {
  const element = document.getElementById(fieldId);
  return element ? element.value.trim() : "";
}

function setInputValue(fieldId, value) {
  const element = document.getElementById(fieldId);
  if (element) element.value = value;
}

function normalizeList(value){
  return value
    .split(/[,\n;]/)
    .map(item => item.trim())
    .filter(Boolean)
    .join(", ");
}

function buildResumeData() {
  return {
    name: getInputValue("name"),
    role: getInputValue("role"),
    experienceYears: getInputValue("experienceYears"),
    email: getInputValue("email"),
    phone: getInputValue("phone"),
    address: getInputValue("address"),
    linkedin: getInputValue("linkedin"),
    portfolio: getInputValue("portfolio"),
    summary: getInputValue("summary"),
    objective: getInputValue("objective"),
    skills: normalizeList(getInputValue("skills")),
    softSkills: normalizeList(getInputValue("softSkills")),
    experience: getInputValue("experience"),
    education: getInputValue("education"),
    projects: getInputValue("projects"),
    certifications: getInputValue("certifications"),
    languages: normalizeList(getInputValue("languages")),
    // avatar data is stored as a data URL in localStorage by the upload handler
    avatar: localStorage.getItem('avatarData') || ''
  };
}

function validateResumeData(resumeData) {
  const errors = [];
  if (!resumeData.name) errors.push("Full name is required.");
  if (!resumeData.role) errors.push("Target role is required.");
  if (!resumeData.email) errors.push("Email is required.");
  if (!resumeData.phone) errors.push("Phone number is required.");
  if (!resumeData.summary && !resumeData.objective) {
    errors.push("Please add either a professional summary or a career objective.");
  }
  return errors;
}

function showNotification(message, type = "info") {
  const existing = document.querySelector(".toast-notification");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast-notification ${type}`;
  toast.innerText = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("visible");
  }, 50);
  setTimeout(() => toast.remove(), 5000);
}

function saveResumeData(data) {
  localStorage.setItem(RESUME_STORAGE_KEY, JSON.stringify(data));
}

function clearForm() {
  const fields = [
    "name",
    "role",
    "experienceYears",
    "email",
    "phone",
    "address",
    "linkedin",
    "portfolio",
    "summary",
    "objective",
    "skills",
    "softSkills",
    "experience",
    "education",
    "projects",
    "certifications",
    "languages"
  ];
  fields.forEach(field => setInputValue(field, ""));
  showNotification("Form cleared.", "success");
}

function generateResume() {
  const resumeData = buildResumeData();
  const errors = validateResumeData(resumeData);

  if (errors.length) {
    showNotification(errors.join(" "), "error");
    return;
  }

  saveResumeData(resumeData);
  window.location.href = "resume.html";
}

function updateObjectiveButton(isBusy) {
  const button = document.getElementById("generateObjectiveButton");
  if (!button) return;
  button.disabled = isBusy;
  button.innerText = isBusy ? "Generating…" : "Generate Objective";
}

async function generateObjectiveFromAI() {
  const name = getInputValue("name");
  const role = getInputValue("role");
  const summary = getInputValue("summary");
  const skills = getInputValue("skills");
  const softSkills = getInputValue("softSkills");
  const experienceYears = getInputValue("experienceYears");

  if (!name || !role) {
    showNotification("Enter your full name and target role before generating the objective.", "error");
    return;
  }

  updateObjectiveButton(true);

  const promptText = `Write a concise resume objective for a candidate applying for the role of ${role}. Begin with a forward-looking phrase such as "Seeking a challenging opportunity" and describe the candidate's technical strengths, motivation to learn, and desire to gain practical experience through real-world projects. Avoid phrasing like "X is a Y" or using first-person introductions; instead use a professional, impact-oriented statement that emphasizes relevant skills, growth, and contribution to organizational success. ${experienceYears ? `The candidate has ${experienceYears} of professional experience.` : ""} Use the summary: ${summary || "not provided"}. Technical skills: ${skills || "not specified"}. Soft skills: ${softSkills || "not specified"}. If details are missing, do not ask for more information; create a strong objective using the available data.`;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta2/models/${GOOGLE_AI_MODEL}:generateText?key=${GOOGLE_AI_STUDIO_API_KEY}`;

  // Attempt the AI call with retries, then fallback locally if all retries fail.
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
    contents: [{
        parts: [{
            text: promptText
          }]
    }]
        })
        // set a reasonable timeout by racing with an abortable promise? Keep simple here.
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(errorBody || `HTTP ${response.status}`);
      }

      const result = await response.json();
      const generatedText = result?.candidates?.[0]?.content?.trim();
      if (!generatedText) throw new Error("AI returned empty content");

      setInputValue("objective", generatedText);
      showNotification("Objective generated successfully.", "success");
      lastError = null;
      break; // success
    } catch (err) {
      console.warn(`AI attempt ${attempt} failed:`, err && err.message ? err.message : err);
      lastError = err && err.message ? err.message : String(err);
      // exponential backoff before retrying
      if (attempt < maxAttempts) {
        const waitMs = 400 * Math.pow(2, attempt - 1);
        await new Promise(res => setTimeout(res, waitMs));
        continue;
      }
    }
  }

  if (lastError) {
    // All attempts failed — use fallback and persist explanation.
    const fallback = generateObjectiveFallback(role, experienceYears, summary, skills, softSkills);
    setInputValue("objective", fallback);
    localStorage.setItem("lastObjectiveError", JSON.stringify({ time: Date.now(), message: lastError }));
    showNotification("AI is not functioning. A fallback objective has been generated using the details provided.", "warning");
  }

  updateObjectiveButton(false);
}

function generateObjectiveFallback(role, expYears, summary, skills, softSkills) {
  const lines = [];
  lines.push(`Seeking a challenging opportunity to contribute to ${role} work${expYears ? ` with ${expYears} of experience` : ""}.`);
  if (summary) lines.push(summary);
  if (skills) lines.push(`Technical skills: ${normalizeList(skills)}.`);
  if (softSkills) lines.push(`Soft skills: ${normalizeList(softSkills)}.`);
  lines.push("Committed to learning new technologies, gaining practical experience through real-world projects, and supporting organizational growth.");
  return lines.join(" ").replace(/\s+/g, ' ').trim();
}

function extractKeywords(text) {
  const stopWords = new Set(["the","and","for","with","that","this","from","role","must","will","have","has","are","is","in","to","of","or","as","be","on","by","an","at","your","you","a"]);
  return (text || "")
    .toLowerCase()
    .replace(/[\d\W_]+/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word))
    .reduce((unique, word) => {
      if (!unique.includes(word)) unique.push(word);
      return unique;
    }, [])
    .slice(0, 25);
}

function getNormalizedResumeText(data) {
  return [
    data.role,
    data.summary,
    data.objective,
    data.skills,
    data.experience,
    data.education,
    data.projects,
    data.certifications,
    data.languages
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function checkATSMatch() {
  const rawData = localStorage.getItem(RESUME_STORAGE_KEY);
  if (!rawData) {
    showNotification("Please create and save the resume before checking ATS match.", "error");
    return;
  }

  const data = JSON.parse(rawData);
  const jobText = getInputValue("jobDescription");

  if (!jobText) {
    showNotification("Paste the role description or company requirements first.", "error");
    return;
  }

  const keywords = extractKeywords(jobText);
  const resumeText = getNormalizedResumeText(data);

  const matched = keywords.filter(keyword => resumeText.includes(keyword));
  const missing = keywords.filter(keyword => !resumeText.includes(keyword));
  const score = keywords.length ? Math.round((matched.length / keywords.length) * 100) : 0;
  // Save match details so the resume page can highlight matched keywords and provide explanations
  const matchData = { keywords, matched, missing, score, timestamp: Date.now() };
  localStorage.setItem(ATS_MATCH_KEY, JSON.stringify(matchData));

  const resultElement = document.getElementById("atsResult");
  if (resultElement) {
    resultElement.innerHTML = `
      <div class="ats-card">
        <strong>ATS Score:</strong> ${score} / 100<br>
        <strong>Matched Keywords:</strong> ${matched.length} / ${keywords.length}<br>
        <strong>Missing Keywords:</strong> ${missing.length}
        ${missing.length ? `<div class="ats-missing">${missing.slice(0, 12).join(", ")}</div>` : ""}
      </div>
    `;
  }

  showNotification(`ATS match score computed: ${score}/100`, "success");
}

function showExplanation() {
  const lastError = JSON.parse(localStorage.getItem("lastObjectiveError") || "null");
  const ats = JSON.parse(localStorage.getItem(ATS_MATCH_KEY) || "null");
  const explanationParts = [
    "ATS (Applicant Tracking System) is software employers use to scan resumes for role-specific keywords and qualifications.",
    "A strong objective should be concise, tailored to your target role, and highlight the value you bring to the employer.",
    "Use the Objective field to summarize your professional focus, relevant experience, and the impact you aim to make.",
    "Use the Job Description field to paste the role requirements so the ATS match checker can compare your resume content with the employer's keywords.",
  ];

  if (lastError) explanationParts.push(`Last AI error: ${new Date(lastError.time).toLocaleString()} — ${lastError.message}`);
  if (ats) {
    explanationParts.push(`ATS score: ${ats.score}/100. Matched: ${ats.matched.length}, Missing: ${ats.missing.length}. Missing keywords: ${ats.missing.slice(0,12).join(', ')}`);
  } else {
    explanationParts.push("No ATS check performed yet.");
  }

  alert(explanationParts.join('\n\n'));
}


// Avatar upload handler: reads file and stores as data URL in localStorage, updates preview
function handleAvatarUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    try {
      localStorage.setItem('avatarData', dataUrl);
    } catch (err) {
      console.error('Failed to store avatar in localStorage', err);
    }
    const preview = document.getElementById('avatarPreview');
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }
  };
  reader.readAsDataURL(file);
}

function downloadResumeFile() {
  const rawData = localStorage.getItem(RESUME_STORAGE_KEY);
  if (!rawData) {
    showNotification("No resume data available for download.", "error");
    return;
  }

  const data = JSON.parse(rawData);
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${data.name} Resume</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #1a1a1a; background: #f7f7f7; }
    .resume-container { max-width: 900px; margin: 0 auto; background: #fff; padding: 30px; border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,0.08); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 28px; }
    .header h1 { margin: 0; font-size: 2rem; }
    .header p { margin: 4px 0 0; color: #5f6d7a; }
    h2 { margin: 30px 0 12px; font-size: 1.1rem; letter-spacing: .08em; text-transform: uppercase; color: #2a3140; }
    p { margin: 8px 0 0; line-height: 1.75; }
    .info-list { list-style: none; padding: 0; margin: 0; }
    .info-list li { margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="resume-container">
    <div class="header">
      <div>
        <h1>${data.name}</h1>
        <p>${data.role}${data.experienceYears ? ` | ${data.experienceYears}` : ""}</p>
      </div>
      <div>
        <p>Email: ${data.email || "N/A"}</p>
        <p>Phone: ${data.phone || "N/A"}</p>
        <p>Address: ${data.address || "N/A"}</p>
        <p>LinkedIn: ${data.linkedin || "N/A"}</p>
        <p>Portfolio: ${data.portfolio || "N/A"}</p>
      </div>
    </div>
    <h2>Career Objective</h2>
    <p>${data.objective || data.summary || "No objective provided."}</p>
    <h2>Skills</h2>
    <p>${data.skills || "Not specified."}</p>
    <h2>Soft Skills</h2>
    <p>${data.softSkills || "Not specified."}</p>
    <h2>Experience</h2>
    <p>${data.experience || "No experience details provided."}</p>
    <h2>Education</h2>
    <p>${data.education || "No education details provided."}</p>
    <h2>Projects</h2>
    <p>${data.projects || "No projects provided."}</p>
    <h2>Certifications</h2>
    <p>${data.certifications || "None."}</p>
    <h2>Languages</h2>
    <p>${data.languages || "Not specified."}</p>
  </div>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: "text/html" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = `${data.name.replace(/\s+/g, "_") || "resume"}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  showNotification("Resume downloaded successfully.", "success");
}

function fillFormFromLocalStorage() {
  const rawData = localStorage.getItem(RESUME_STORAGE_KEY);
  if (!rawData) return;

  const data = JSON.parse(rawData);
  Object.keys(data).forEach((field) => {
    if (document.getElementById(field)) {
      setInputValue(field, data[field]);
    }
  });
  // populate avatar preview if present
  const avatarData = localStorage.getItem('avatarData');
  if (avatarData) {
    const preview = document.getElementById('avatarPreview');
    if (preview) { preview.src = avatarData; preview.style.display = 'block'; }
  }
}

function renderResumePage() {
  if (!document.body.classList.contains("resume-shell")) {
    return;
  }

  const rawData = localStorage.getItem(RESUME_STORAGE_KEY);
  if (!rawData) {
    showNotification("No resume data found. Please create a resume first.", "error");
    return;
  }

  const data = JSON.parse(rawData);

  document.getElementById("resumeName").innerText = data.name || "Your Full Name";
  document.getElementById("resumeRole").innerText = data.role ? `${data.role} | ${data.experienceYears || "Experience"}` : "Professional Role";
  document.getElementById("email").innerText = data.email ? `Email: ${data.email}` : "";
  document.getElementById("phone").innerText = data.phone ? `Phone: ${data.phone}` : "";
  document.getElementById("address").innerText = data.address ? `Address: ${data.address}` : "";
  document.getElementById("linkedin").innerText = data.linkedin ? `LinkedIn: ${data.linkedin}` : "";
  document.getElementById("portfolio").innerText = data.portfolio ? `Portfolio: ${data.portfolio}` : "";
  const softSkillsElement = document.getElementById("softSkillsDisplay");
  if (softSkillsElement) softSkillsElement.innerText = data.softSkills ? `Soft skills: ${data.softSkills}` : "";
  document.getElementById("objective").innerText = data.objective || data.summary || "No objective provided.";
  document.getElementById("experience").innerText = data.experience || "No experience details provided.";
  document.getElementById("education").innerText = data.education || "No education details provided.";
  document.getElementById("projects").innerText = data.projects || "No projects provided.";
  document.getElementById("certifications").innerText = data.certifications || "No certifications listed.";
  document.getElementById("languages").innerText = data.languages || "Not specified.";

  // render avatar image if available
  try {
    const avatarUrl = data.avatar || localStorage.getItem('avatarData') || '';
    const avatarImg = document.getElementById('avatarImg');
    if (avatarImg && avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = 'block';
    }
  } catch (e) {
    console.error('Avatar render error', e);
  }

  const skillsElement = document.getElementById("skills");
  if (skillsElement) {
    skillsElement.innerText = data.skills || "Not specified.";
  }
  
  // Highlight matched ATS keywords if available
  try {
    const ats = JSON.parse(localStorage.getItem(ATS_MATCH_KEY) || "null");
    if (ats && ats.matched && ats.matched.length) {
      const keywords = ats.matched.slice();
      // helper to escape regex
      const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // sort by length desc to avoid partial overlaps
      keywords.sort((a,b)=>b.length-a.length);

      const highlightText = (text) => {
        if (!text) return text;
        let out = text;
        keywords.forEach(k => {
          const re = new RegExp(`\\b${escapeRegExp(k)}\\b`, 'gi');
          out = out.replace(re, match => `<mark class="highlight">${match}</mark>`);
        });
        return out;
      };

      // apply highlights to blocks
      const blocks = ['objective','experience','education','projects','skills'];
      blocks.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = highlightText(el.innerText || el.textContent || '');
      });
    }
  } catch (e) {
    console.error('Failed to apply ATS highlights', e);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  fillFormFromLocalStorage();
  renderResumePage();
  const avatarInput = document.getElementById('avatarInput');
  if (avatarInput) avatarInput.addEventListener('change', handleAvatarUpload);
});