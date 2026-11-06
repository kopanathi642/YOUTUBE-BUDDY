import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useBrand } from "../App";

/** Plain-language privacy policy and terms, written from what the app actually does. Have a lawyer review before launch. */
export default function Legal({ kind }: { kind: "privacy" | "terms" }) {
  const brand = useBrand();
  const [mail, setMail] = useState<string | null>(null);
  useEffect(() => { api<{ contact_email?: string }>("/auth/config").then((c) => setMail(c.contact_email ?? null)).catch(() => {}); }, []);
  const contact = mail ? <a href={`mailto:${mail}`}>{mail}</a> : "the contact email on our website";
  return (
    <div className="legal">
      <Link to="/" className="dim">← {brand}</Link>
      {kind === "privacy" ? <>
        <h1>Privacy policy</h1>
        <p className="dim">Last updated 6 November 2026</p>
        <h2>What we collect</h2>
        <ul>
          <li><b>Account:</b> your name, email, and (if you use Google sign-in) your Google profile picture. Passwords are stored only as Argon2 hashes.</li>
          <li><b>Your media and projects:</b> files you upload, timelines, exports and AI outputs, stored in private cloud storage. Only members of your workspace can open them.</li>
          <li><b>Usage records:</b> security and activity logs (for example sign-ins, exports, AI runs) with IP address, kept to protect accounts and improve the product.</li>
          <li><b>Payments:</b> the plan, amount and the UPI/PayPal transaction ID you submit. We never see or store your bank, card, UPI PIN or PayPal password.</li>
          <li><b>Feedback</b> you choose to send.</li>
        </ul>
        <h2>How we use it</h2>
        <p>To run the editor and AI tools you ask for, render and store your exports, verify payments, keep accounts secure, and decide what to improve. We do not sell your data and we do not use your uploads to train AI models.</p>
        <h2>Services that process your data</h2>
        <ul>
          <li>Cloud hosting, database and file storage providers that run the app.</li>
          <li>Google (only if you use Google sign-in or connect YouTube).</li>
          <li>Hosted AI providers such as fal.ai, Anthropic or OpenAI — only for the premium AI tools you run, and only the inputs of that run.</li>
          <li>Pexels / Pixabay when you search the stock library (your search words only).</li>
        </ul>
        <h2>YouTube</h2>
        <p>If you connect YouTube, {brand} uses YouTube API Services to upload the videos you choose to publish, with the title, description and visibility you set. We store an encrypted access token, never your Google password. See the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noreferrer">YouTube Terms of Service</a> and the <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>. You can disconnect anytime in Settings, or revoke access at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>; we then delete the stored token.</p>
        <h2>Cookies</h2>
        <p>One essential sign-in cookie. No advertising or tracking cookies.</p>
        <h2>Your rights</h2>
        <p>You can access, correct or delete your data, and withdraw consent, under India's Digital Personal Data Protection Act, 2023 (and GDPR if you are in the EU). Email {contact}. Deleted files are removed from storage; security logs may be kept for up to 1 year.</p>
        <h2>Children</h2>
        <p>The service is not for children under 13. Users under 18 need a parent's or guardian's consent.</p>
        <h2>Contact / grievance officer</h2>
        <p>{contact}</p>
      </> : <>
        <h1>Terms of service</h1>
        <p className="dim">Last updated 6 November 2026</p>
        <h2>Using {brand}</h2>
        <p>You must be at least 13 (with a guardian's consent if under 18). Keep your account secure; you are responsible for what happens in it.</p>
        <h2>Your content</h2>
        <p>You keep all rights to what you upload and create. You give us permission only to store, process and render it to provide the service. You must have the rights to everything you upload, including music, footage, faces and voices.</p>
        <h2>AI tools</h2>
        <p>AI outputs can be wrong or look like real people. Do not create deceptive, defamatory, sexual or non-consensual content of real people, or impersonate anyone. Label realistic AI content where platforms or law require it (we add an AI label to generated files). Face and voice tools need the consent of the person shown or heard.</p>
        <h2>Plans and payments</h2>
        <p>Paid plans last 30 days per month paid and switch on after we verify your UPI or PayPal payment. Plans do not renew automatically. If a payment cannot be verified it is rejected and nothing is charged by us. Refunds for a verified payment can be requested within 7 days if you have not used premium AI runs.</p>
        <h2>Free plan</h2>
        <p>Free exports carry a small "Made with {brand}" badge; paid plans remove it. Free-plan limits may change.</p>
        <h2>Acceptable use</h2>
        <p>No illegal content, malware, spam, attempts to break security, or reselling the service. We may suspend accounts that break these terms.</p>
        <h2>Service</h2>
        <p>The service is provided "as is". We work to keep your files safe, but keep your own copies of important work. Our liability is limited to the amount you paid us in the last 3 months.</p>
        <h2>Law</h2>
        <p>These terms are governed by the laws of India. Contact: {contact}.</p>
      </>}
      <p className="dim" style={{ marginTop: 32, fontSize: 12 }}>{kind === "privacy" ? <Link to="/terms">Terms of service</Link> : <Link to="/privacy">Privacy policy</Link>}</p>
    </div>
  );
}
