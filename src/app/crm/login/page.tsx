import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <div className="crm-login">
      <div className="crm-login__card">
        <span className="crm-login__mark" aria-hidden="true">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11.5 12 4l9 7.5" />
            <path d="M5 10.2V20h14v-9.8" />
            <path d="M9.5 20v-5.5h5V20" />
          </svg>
        </span>
        <h1>Australian Roofing Contractors</h1>
        <p className="crm-login__sub">
          Internal quoting. Enter your email and we&rsquo;ll send a sign-in link &mdash;
          no password to remember.
        </p>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
