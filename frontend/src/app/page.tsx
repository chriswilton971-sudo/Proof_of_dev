'use client';

import { ConnectWallet } from '@/components/ConnectWallet';
import { DeveloperDashboard } from '@/components/DeveloperDashboard';
import { ActionButtons } from '@/components/ActionButtons';
import { Award } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Award className="text-primary" size={32} />
              <h1 className="text-2xl font-bold text-gray-900">Proof of Dev</h1>
            </div>
            <ConnectWallet />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold text-gray-900 mb-4">
            Your On-Chain Developer Reputation
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Mint a soulbound NFT that represents your verified on-chain development activity, contract deployments, and reputation score.
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-8">
          {/* Dashboard */}
          <DeveloperDashboard />

          {/* Action Buttons */}
          <div className="flex justify-center">
            <ActionButtons />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white border-t border-gray-200 mt-16 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl mb-4">🔗</div>
              <h4 className="font-semibold text-gray-900 mb-2">Soulbound Token</h4>
              <p className="text-gray-600">Non-transferable NFT tied to your identity</p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">📊</div>
              <h4 className="font-semibold text-gray-900 mb-2">On-Chain Data</h4>
              <p className="text-gray-600">Verified contract deployments and activity</p>
            </div>
            <div className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <h4 className="font-semibold text-gray-900 mb-2">Updatable</h4>
              <p className="text-gray-600">Score updates as you deploy new contracts</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-400">© 2024 Proof of Dev. A soulbound developer reputation system.</p>
        </div>
      </footer>
    </main>
  );
}
