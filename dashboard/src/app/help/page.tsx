'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle,
  Book,
  MessageCircle,
  FileText,
  ExternalLink,
  Mail,
  Phone,
  Video,
  ChevronDown,
  Search,
} from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';

interface FAQItem {
  id: number;
  question: string;
  answer: string;
}

const HelpPage = () => {
  const { user } = useFinaultStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);

  const faqItems: FAQItem[] = [
    {
      id: 1,
      question: 'How do I upload an invoice?',
      answer:
        'To upload an invoice, navigate to the Upload section in the main menu. Click the "Upload Invoice" button, select your file (PDF or image format), and follow the guided steps. Our AI system will automatically extract key information including vendor, amount, and due date. You can review and edit the extracted data before confirming.',
    },
    {
      id: 2,
      question: 'What is a Close Pack?',
      answer:
        'A Close Pack is a collection of related invoices and expenses that you want to review, approve, and process together as a single unit. Close Packs are useful for organizing expenses by project, cost center, or time period. You can create a Close Pack, add invoices to it, review them together, and then submit for processing or approval.',
    },
    {
      id: 3,
      question: 'How does cost allocation work?',
      answer:
        'Cost allocation in Finault allows you to distribute expenses across multiple cost centers, projects, or departments. You can create allocation rules based on percentages, fixed amounts, or automatic allocation based on your organization structure. The system tracks all allocations for audit purposes and provides detailed reports showing how costs are distributed.',
    },
    {
      id: 4,
      question: 'Can I connect my ERP system?',
      answer:
        'Yes! Finault supports integration with major ERP systems including SAP, Oracle, NetSuite, and others. Go to Settings > Integrations to see available connectors. You will need API credentials from your ERP system. Our integration wizard will guide you through the setup process. Once connected, data syncs automatically based on your configured schedule.',
    },
    {
      id: 5,
      question: 'How do I invite team members?',
      answer:
        'To invite team members, go to Settings > Team Members and click "Invite New Member". Enter their email address and select their role (Admin, Approver, or Viewer). They will receive an email invitation with a link to join your workspace. You can revoke access at any time by removing them from the Team Members list.',
    },
    {
      id: 6,
      question: 'What payment methods does Finault support?',
      answer:
        'Finault supports payment via credit card, bank transfer, and ACH. All payments are processed securely through our PCI-compliant payment processor. For enterprise customers, we offer custom billing arrangements. You can manage your billing settings and payment methods in the Settings > Billing section.',
    },
  ];

  const quickLinks = [
    {
      id: 1,
      title: 'Documentation',
      description: 'Browse our comprehensive user guides and tutorials',
      icon: Book,
      href: '#',
      color: 'from-green-500 to-green-600',
    },
    {
      id: 2,
      title: 'API Reference',
      description: 'Integrate Finault with your existing systems',
      icon: FileText,
      href: '#',
      color: 'from-blue-500 to-blue-600',
    },
    {
      id: 3,
      title: 'Video Tutorials',
      description: 'Watch step-by-step guides for key features',
      icon: Video,
      href: '#',
      color: 'from-purple-500 to-purple-600',
    },
    {
      id: 4,
      title: 'Community Forum',
      description: 'Connect with other Finault users',
      icon: MessageCircle,
      href: '#',
      color: 'from-orange-500 to-orange-600',
    },
    {
      id: 5,
      title: 'Contact Support',
      description: 'Get help from our support team',
      icon: Mail,
      href: '#',
      color: 'from-pink-500 to-pink-600',
    },
    {
      id: 6,
      title: 'Status Page',
      description: 'Check system status and incidents',
      icon: ExternalLink,
      href: '#',
      color: 'from-cyan-500 to-cyan-600',
    },
  ];

  const filteredFAQ = faqItems.filter(
    (item) =>
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 12,
      },
    },
  };

  const cardVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: {
      opacity: 1,
      scale: 1,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 12,
      },
    },
    hover: {
      y: -5,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 12,
      },
    },
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Header title="Help & Support" subtitle="Get help and learn about Finault" />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-8">
          {/* Header Section */}
          <motion.div
            className="mb-12"
            initial="hidden"
            animate="visible"
            variants={itemVariants}
          >
            <div className="flex items-center gap-3 mb-2">
              <HelpCircle
                size={32}
                className="text-green-500"
                style={{ color: 'hsl(142 76% 36%)' }}
              />
              <h1 className="text-4xl font-bold">Help & Support</h1>
            </div>
            <p className="text-gray-500 text-lg">
              Get help and learn about Finault
            </p>
          </motion.div>

          {/* Search Bar */}
          <motion.div
            className="mb-12"
            initial="hidden"
            animate="visible"
            variants={itemVariants}
            transition={{ delay: 0.1 }}
          >
            <div className="relative max-w-2xl">
              <Search className="absolute left-4 top-3.5 text-gray-500" size={20} />
              <input
                type="text"
                placeholder="Search help articles and FAQs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                style={{
                  '--tw-ring-color': 'hsl(142 76% 36%)',
                  '--tw-border-opacity': '1',
                } as React.CSSProperties}
              />
            </div>
          </motion.div>

          {/* Quick Links Section */}
          <motion.section
            className="mb-16"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
          >
            <h2 className="text-2xl font-bold mb-6">Quick Links</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quickLinks.map((link) => {
                const IconComponent = link.icon;
                return (
                  <motion.a
                    key={link.id}
                    href={link.href}
                    className={`group bg-gradient-to-br ${link.color} p-6 rounded-lg cursor-pointer transition-all`}
                    variants={cardVariants}
                    whileHover="hover"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <IconComponent size={28} className="text-white" />
                      <ExternalLink
                        size={20}
                        className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      {link.title}
                    </h3>
                    <p className="text-white text-opacity-90 text-sm">
                      {link.description}
                    </p>
                  </motion.a>
                );
              })}
            </div>
          </motion.section>

          {/* FAQ Section */}
          <motion.section
            className="mb-16"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>

            {filteredFAQ.length > 0 ? (
              <div className="space-y-4 max-w-4xl">
                {filteredFAQ.map((item) => (
                  <motion.div
                    key={item.id}
                    className="bg-white rounded-lg border border-gray-200 overflow-hidden"
                    variants={itemVariants}
                  >
                    <button
                      onClick={() =>
                        setExpandedFAQ(
                          expandedFAQ === item.id ? null : item.id
                        )
                      }
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-lg font-medium text-left text-gray-900">
                        {item.question}
                      </span>
                      <motion.div
                        animate={{
                          rotate: expandedFAQ === item.id ? 180 : 0,
                        }}
                        transition={{ type: 'spring', stiffness: 200 }}
                      >
                        <ChevronDown
                          size={24}
                          className="text-green-500 flex-shrink-0"
                          style={{ color: 'hsl(142 76% 36%)' }}
                        />
                      </motion.div>
                    </button>

                    <AnimatePresence>
                      {expandedFAQ === item.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{
                            type: 'spring',
                            stiffness: 300,
                            damping: 30,
                          }}
                        >
                          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 text-gray-600 leading-relaxed">
                            {item.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            ) : (
              <motion.div
                className="text-center py-12 text-gray-500"
                variants={itemVariants}
              >
                <p className="text-lg">No FAQs found matching your search.</p>
              </motion.div>
            )}
          </motion.section>

          {/* Contact Support Section */}
          <motion.section
            className="mb-16"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
            transition={{ delay: 0.3 }}
          >
            <h2 className="text-2xl font-bold mb-6">Contact Support</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
              {/* Email Support */}
              <motion.div
                className="bg-white border border-gray-200 rounded-lg p-6"
                variants={cardVariants}
                whileHover="hover"
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'hsl(142 76% 36%)' }}
                >
                  <Mail size={24} className="text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-gray-900">Email Support</h3>
                <p className="text-gray-500 text-sm mb-4">
                  Get help via email from our support team
                </p>
                <a
                  href="mailto:support@finault.io"
                  className="inline-block px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: 'hsl(142 76% 36%)',
                    color: 'white',
                  }}
                >
                  support@finault.io
                </a>
              </motion.div>

              {/* Live Chat */}
              <motion.div
                className="bg-white border border-gray-200 rounded-lg p-6"
                variants={cardVariants}
                whileHover="hover"
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'hsl(142 76% 36%)' }}
                >
                  <MessageCircle size={24} className="text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-gray-900">Live Chat</h3>
                <p className="text-gray-500 text-sm mb-4">
                  Chat with our support team in real-time
                </p>
                <button
                  className="inline-block px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: 'hsl(142 76% 36%)',
                    color: 'white',
                  }}
                >
                  Start Chat
                </button>
              </motion.div>

              {/* Phone Support */}
              <motion.div
                className="bg-white border border-gray-200 rounded-lg p-6"
                variants={cardVariants}
                whileHover="hover"
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'hsl(142 76% 36%)' }}
                >
                  <Phone size={24} className="text-white" />
                </div>
                <h3 className="text-lg font-semibold mb-2 text-gray-900">Phone Support</h3>
                <p className="text-gray-500 text-sm mb-4">
                  Call us during business hours (9am-6pm EST)
                </p>
                <a
                  href="tel:+1-555-0100"
                  className="inline-block px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: 'hsl(142 76% 36%)',
                    color: 'white',
                  }}
                >
                  +1 (555) 0100
                </a>
              </motion.div>
            </div>
          </motion.section>

          {/* Additional Resources */}
          <motion.section
            className="bg-white border border-gray-200 rounded-lg p-8 max-w-4xl"
            initial="hidden"
            animate="visible"
            variants={itemVariants}
            transition={{ delay: 0.4 }}
          >
            <h3 className="text-xl font-bold mb-4 text-gray-900">Need More Help?</h3>
            <p className="text-gray-600 mb-6">
              Our comprehensive documentation covers all aspects of Finault,
              including setup, integration, and best practices. If you can't
              find what you're looking for, our support team is ready to help.
            </p>
            <div className="flex gap-4">
              <button
                className="px-6 py-2 rounded-lg font-medium transition-all"
                style={{
                  backgroundColor: 'hsl(142 76% 36%)',
                  color: 'white',
                }}
              >
                View Documentation
              </button>
              <button
                className="px-6 py-2 rounded-lg font-medium border border-gray-300 text-gray-900 hover:bg-gray-100 transition-all"
              >
                Request a Demo
              </button>
            </div>
          </motion.section>
        </main>
      </div>
    </div>
  );
};

export default HelpPage;
