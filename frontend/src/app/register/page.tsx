'use client';

import { useActionState } from 'react';
import { registerAction } from '../../actions/auth-register';

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, null);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <form 
        action={formAction} 
        className="w-full max-w-sm bg-[#f5f5f5] p-8 rounded-2xl shadow-2xl flex flex-col gap-4"
      >
        <h2 className="text-2xl font-bold text-center text-black tracking-wider uppercase mb-2">Create Account</h2>
        
        {state?.error && (
          <p className="text-sm text-red-400 text-center bg-red-950/30 p-2 rounded">
            {state.error}
          </p>
        )}
        
        {/* แยกเป็น firstName และ lastName ตาม Mutation */}
        <input 
          name="firstName" 
          type="text" 
          placeholder="First Name" 
          required 
          className="w-full p-3 bg-[#f5f5f5] border border-[#333] rounded-lg outline-none focus:border-[#333] text-[#333] placeholder-gray-500"
        />
        <input 
          name="lastName" 
          type="text" 
          placeholder="Last Name" 
          required 
          className="w-full p-3 bg-[#f5f5f5] border border-[#333] rounded-lg outline-none focus:border-[#333] text-[#333] placeholder-gray-500"
        />
        <input 
          name="email" 
          type="email" 
          placeholder="Email" 
          required 
          className="w-full p-3 bg-[#f5f5f5] border border-[#333] rounded-lg outline-none focus:border-[#333] text-[#333] placeholder-gray-500"
        />
        <input 
          name="password" 
          type="password" 
          placeholder="Password" 
          required 
          className="w-full p-3 bg-[#f5f5f5] border border-[#333] rounded-lg outline-none focus:border-[#333] text-[#333] placeholder-gray-500"
        />
        
        <button 
          type="submit" 
          disabled={pending}
          className="w-full py-3 bg-[#333] text-[#f5f5f5] rounded-lg hover:bg-[#444] transition-colors font-medium uppercase"
        >
          {pending ? 'Registering...' : 'Register'}
        </button>
      </form>
    </div>
  );
}