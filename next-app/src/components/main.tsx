"use client";

import { useState } from "react";
import Ecdsa from "./ecdsa";

export default function Main() {
  const [step, setStep] = useState<"ecdsa" | "webauthn">();

  return (
    <div className="flex gap-4">
      {!step && (
        <>
          <button
            className="bg-blue-500 text-sm font-bold text-white px-4 py-2 rounded-md"
            onClick={() => setStep("ecdsa")}
          >
            ECDSA
          </button>
          <button
            className="bg-blue-500 text-sm font-bold text-white px-4 py-2 rounded-md"
            onClick={() => setStep("webauthn")}
          >
            WebAuthn
          </button>
        </>
      )}
      {step === "ecdsa" && (
        <div>
          <Ecdsa />
        </div>
      )}
    </div>
  );
}
