'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  UserPlus,
  Shield,
  Mail,
  MoreHorizontal,
  Check,
  Clock,
  X,
} from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { useFinaultStore } from '@/lib/store';
import { api } from '@/lib/api';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'Finance Manager' | 'Engineering Admin' | 'Auditor' | 'Viewer';
  status: 'Active' | 'Pending' | 'Inactive';
  lastActive: string;
  initials: string;
  joinedDate: string;
}

const getRoleColor = (role: string): string => {
  switch (role) {
    case 'Admin':
      return 'hsl(0 84% 60%)'; // red
    case 'Finance Manager':
      return 'hsl(142 76% 36%)'; // green
    case 'Engineering Admin':
      return 'hsl(217 91% 60%)'; // blue
    case 'Auditor':
      return 'hsl(280 85% 67%)'; // purple
    case 'Viewer':
      return 'hsl(215 14% 34%)'; // gray
    default:
      return 'hsl(215 14% 34%)';
  }
};

const getRoleBgColor = (role: string): string => {
  switch (role) {
    case 'Admin':
      return 'bg-red-900/20';
    case 'Finance Manager':
      return 'bg-green-900/20';
    case 'Engineering Admin':
      return 'bg-blue-900/20';
    case 'Auditor':
      return 'bg-purple-900/20';
    case 'Viewer':
      return 'bg-gray-900/20';
    default:
      return 'bg-gray-900/20';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'Active':
      return <Check className="w-4 h-4 text-green-400" />;
    case 'Pending':
      return <Clock className="w-4 h-4 text-yellow-400" />;
    case 'Inactive':
      return <X className="w-4 h-4 text-red-400" />;
    default:
      return null;
  }
};

const demoTeamMembers: TeamMember[] = [
  {
    id: '1',
    name: 'Sarah Chen',
    email: 'sarah.chen@company.com',
    role: 'Admin',
    status: 'Active',
    lastActive: '2 minutes ago',
    initials: 'SC',
    joinedDate: 'Jan 15, 2024',
  },
  {
    id: '2',
    name: 'James Rodriguez',
    email: 'james.rodriguez@company.com',
    role: 'Finance Manager',
    status: 'Active',
    lastActive: '1 hour ago',
    initials: 'JR',
    joinedDate: 'Feb 20, 2024',
  },
  {
    id: '3',
    name: 'Emily Watson',
    email: 'emily.watson@company.com',
    role: 'Engineering Admin',
    status: 'Active',
    lastActive: '15 minutes ago',
    initials: 'EW',
    joinedDate: 'Jan 8, 2024',
  },
  {
    id: '4',
    name: 'Michael Park',
    email: 'michael.park@company.com',
    role: 'Auditor',
    status: 'Active',
    lastActive: 'Yesterday',
    initials: 'MP',
    joinedDate: 'Mar 1, 2024',
  },
  {
    id: '5',
    name: 'Lisa Johnson',
    email: 'lisa.johnson@company.com',
    role: 'Finance Manager',
    status: 'Pending',
    lastActive: 'Never',
    initials: 'LJ',
    joinedDate: 'Jan 28, 2025',
  },
  {
    id: '6',
    name: 'David Taylor',
    email: 'david.taylor@company.com',
    role: 'Viewer',
    status: 'Active',
    lastActive: '3 days ago',
    initials: 'DT',
    joinedDate: 'Dec 10, 2024',
  },
  {
    id: '7',
    name: 'Amanda Foster',
    email: 'amanda.foster@company.com',
    role: 'Engineering Admin',
    status: 'Inactive',
    lastActive: '2 weeks ago',
    initials: 'AF',
    joinedDate: 'Jan 2, 2024',
  },
  {
    id: '8',
    name: 'Robert Kim',
    email: 'robert.kim@company.com',
    role: 'Viewer',
    status: 'Active',
    lastActive: '30 minutes ago',
    initials: 'RK',
    joinedDate: 'Feb 14, 2024',
  },
];

// FIX 6 (RESOLVED): Removed direct Supabase credentials — all operations now go through gateway API

function mapRole(role: string | undefined): TeamMember['role'] {
  if (!role) return 'Viewer';
  const r = role.toLowerCase();
  if (r === 'admin' || r === 'owner') return 'Admin';
  if (r.includes('finance')) return 'Finance Manager';
  if (r.includes('engineer')) return 'Engineering Admin';
  if (r.includes('audit')) return 'Auditor';
  return 'Viewer';
}

function formatLastActive(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Unknown';
  }
}

const PAGE_SIZE = 25;

// MEDIUM: Hardcoded strings as constants
const STRINGS = {
  LOADING_TEAM: 'Loading team members...',
  TEAM_OVERVIEW: 'Team Overview',
  MEMBERS: 'members',
  ACTIVE: 'active',
  INVITE_USER: 'Invite User',
  TEAM_MEMBERS: 'Team Members',
  CHANGE_ROLE: 'Change role to',
  REMOVE_USER_CONFIRM: 'Are you sure you want to remove this user?',
  LAST_ACTIVE: 'Last active:',
  JOINED: 'Joined',
  INVITE_USER_MODAL: 'Invite User',
  EMAIL_ADDRESS: 'Email Address',
  ROLE_LABEL: 'Role',
  VALID_EMAIL: 'Please enter a valid email address',
  SYSTEM_NOT_CONFIGURED: 'System not configured. Please contact administrator.',
  INVITE_FAILED: 'Invite failed:',
  SEND_INVITE_FAILED: 'Failed to send invite. Please try again.',
  SENDING: 'Sending...',
  SEND_INVITE: 'Send Invite',
  CANCEL: 'Cancel',
  PAGE_INFO: 'Page',
  SHOWING_MEMBERS: 'Showing up to',
  MEMBERS_PER_PAGE: 'members per page',
  PREVIOUS: 'Previous',
  NEXT: 'Next',
  UPDATE_ROLE_FAILED: 'Failed to update role.',
  REMOVE_USER_FAILED: 'Failed to remove user.',
} as const;

/**
 * TeamPage Component
 * Displays team member management interface with invite, edit role, and remove capabilities.
 *
 * FIX 6 (RESOLVED): All CRUD operations now route through the gateway API (/v1/team endpoints)
 * with RBAC enforcement, org-scoped queries, and service-key auth. No direct Supabase calls remain.
 */
export default function TeamPage() {
  const { sidebarOpen } = useFinaultStore();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(demoTeamMembers);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const loadTeam = async () => {
      try {
        setIsLoading(true);
        const result = await api.getTeamMembers({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });

        if (result.success && Array.isArray(result.members)) {
          const mapped: TeamMember[] = result.members.map((p: any, index: number) => {
            const name = p.name || p.email?.split('@')[0] || 'Unknown';
            const nameParts = name.split(' ');
            const initials = nameParts.length >= 2
              ? `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase()
              : name.substring(0, 2).toUpperCase();

            return {
              id: p.id || String(index),
              name,
              email: p.email || 'no-email@company.com',
              role: mapRole(p.role),
              status: p.status === 'inactive' ? 'Inactive' as const : p.status === 'pending' ? 'Pending' as const : 'Active' as const,
              lastActive: p.lastActive ? formatLastActive(p.lastActive) : 'Never',
              initials,
              joinedDate: p.joinedDate ? new Date(p.joinedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown',
            };
          });
          setTeamMembers(mapped);
          setHasMore(result.hasMore);
        }
      } catch (error) {
        console.error('Failed to load team from API, using demo data:', error);
        // Falls back to demoTeamMembers which is already set as initial state
      } finally {
        setIsLoading(false);
      }
    };

    loadTeam();
  }, [page]);

  // ──── FIX #13: CRUD Handlers ────
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [isSaving, setIsSaving] = useState(false);

  const handleInviteUser = async () => {
    if (!inviteEmail) return;

    // Validate email format (MEDIUM)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      alert(STRINGS.VALID_EMAIL);
      return;
    }

    const sanitizedEmail = inviteEmail.trim().toLowerCase();

    setIsSaving(true);
    try {
      // FIX 6 (RESOLVED): Now routes through gateway API with RBAC enforcement
      const result = await api.inviteTeamMember(sanitizedEmail, inviteRole);

      if (result.success) {
        // Add pending member to local state from gateway response
        const name = sanitizedEmail.split('@')[0];
        const initials = name.substring(0, 2).toUpperCase();
        setTeamMembers(prev => [...prev, {
          id: result.member?.id || crypto.randomUUID(),
          name,
          email: sanitizedEmail,
          role: mapRole(inviteRole) as TeamMember['role'],
          status: 'Pending',
          lastActive: 'Never',
          initials,
          joinedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        }]);
        setShowInviteModal(false);
        setInviteEmail('');
        setInviteRole('viewer');
      } else {
        alert(`${STRINGS.INVITE_FAILED} ${(result as any).error || 'Unknown error'}`);
      }
    } catch (error) {
      alert(STRINGS.SEND_INVITE_FAILED);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditRole = async (memberId: string, newRole: string) => {
    if (!confirm(`${STRINGS.CHANGE_ROLE} ${newRole}?`)) return;

    try {
      // FIX 6 (RESOLVED): Now routes through gateway API with RBAC + org isolation
      const result = await api.updateTeamMember(memberId, { role: newRole });

      if (result.success) {
        setTeamMembers(prev => prev.map(m =>
          m.id === memberId ? { ...m, role: mapRole(newRole) as TeamMember['role'] } : m
        ));
      } else {
        alert(STRINGS.UPDATE_ROLE_FAILED);
      }
    } catch (error) {
      alert(STRINGS.UPDATE_ROLE_FAILED);
    }
    setActiveDropdown(null);
  };

  const handleRemoveUser = async (memberId: string) => {
    if (!confirm(STRINGS.REMOVE_USER_CONFIRM)) return;
    try {
      // FIX 6 (RESOLVED): Now routes through gateway API with RBAC + org isolation
      const result = await api.removeTeamMember(memberId);

      if (result.success) {
        setTeamMembers(prev => prev.filter(m => m.id !== memberId));
      } else {
        alert(STRINGS.REMOVE_USER_FAILED);
      }
    } catch (error) {
      alert(STRINGS.REMOVE_USER_FAILED);
    }
    setActiveDropdown(null);
  };

  const totalUsers = teamMembers.length;
  const admins = teamMembers.filter((m) => m.role === 'Admin').length;
  const activeUsers = teamMembers.filter((m) => m.status === 'Active').length;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4, ease: 'easeOut' },
    },
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <div
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-20'
        }`}
      >
        <Header title="Team Management" subtitle="Manage users and permissions" />

        <main className="flex-1 overflow-auto p-6">
          {/* Header with Invite Button */}
          <motion.div
            className="flex justify-between items-center mb-8"
            variants={itemVariants}
            initial="hidden"
            animate="visible"
          >
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {STRINGS.TEAM_OVERVIEW}
              </h1>
              <p className="text-gray-500">
                {totalUsers} {STRINGS.MEMBERS} • {activeUsers} {STRINGS.ACTIVE}
              </p>
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors duration-200"
              style={{ backgroundColor: 'hsl(142 76% 36%)' }}
            >
              <UserPlus className="w-5 h-5" />
              {STRINGS.INVITE_USER}
            </motion.button>
          </motion.div>

          {/* Summary Stats */}
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Total Users Card */}
            <motion.div
              variants={itemVariants}
              className="bg-white rounded-lg p-6 border border-gray-200 hover:border-gray-300 transition-colors duration-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium mb-2">
                    Total Users
                  </p>
                  <p className="text-3xl font-bold text-gray-900">{totalUsers}</p>
                </div>
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'hsl(142 76% 36% / 0.1)' }}
                >
                  <Users className="w-6 h-6" style={{ color: 'hsl(142 76% 36%)' }} />
                </div>
              </div>
            </motion.div>

            {/* Admins Card */}
            <motion.div
              variants={itemVariants}
              className="bg-white rounded-lg p-6 border border-gray-200 hover:border-gray-300 transition-colors duration-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium mb-2">
                    Admins
                  </p>
                  <p className="text-3xl font-bold text-gray-900">{admins}</p>
                </div>
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'hsl(0 84% 60% / 0.1)' }}
                >
                  <Shield className="w-6 h-6" style={{ color: 'hsl(0 84% 60%)' }} />
                </div>
              </div>
            </motion.div>

            {/* Active Users Card */}
            <motion.div
              variants={itemVariants}
              className="bg-white rounded-lg p-6 border border-gray-200 hover:border-gray-300 transition-colors duration-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm font-medium mb-2">
                    Active Users
                  </p>
                  <p className="text-3xl font-bold text-gray-900">{activeUsers}</p>
                </div>
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'hsl(217 91% 60% / 0.1)' }}
                >
                  <Check className="w-6 h-6" style={{ color: 'hsl(217 91% 60%)' }} />
                </div>
              </div>
            </motion.div>
          </motion.div>

          {/* Team Members List */}
          <motion.div
            className="bg-white rounded-lg border border-gray-200"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{STRINGS.TEAM_MEMBERS}</h2>
            </div>

            {/* Member List */}
            <div className="divide-y divide-gray-200">
              {isLoading ? (
                <div className="px-6 py-12 flex justify-center items-center">
                  <div className="flex flex-col items-center gap-4">
                    <div
                      className="w-8 h-8 border-4 border-gray-200 border-t-green-600 rounded-full animate-spin"
                      role="status"
                      aria-label="Loading"
                    ></div>
                    <p className="text-gray-500 text-sm" aria-live="polite">{STRINGS.LOADING_TEAM}</p>
                  </div>
                </div>
              ) : (
                teamMembers.map((member) => (
                <motion.div
                  key={member.id}
                  variants={itemVariants}
                  className="px-6 py-4 hover:bg-gray-50 transition-colors duration-200 relative"
                  role="row"
                  aria-label={`Team member ${member.name}`}
                >
                  <div className="flex items-center justify-between">
                    {/* Left Side - Avatar and Info */}
                    <div className="flex items-center gap-4 flex-1">
                      {/* Avatar */}
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-sm flex-shrink-0"
                        style={{
                          backgroundColor: `hsl(${(member.id.charCodeAt(0) * 60) % 360} 70% 45%)`,
                        }}
                        aria-label={`Avatar for ${member.name}`}
                      >
                        {member.initials}
                      </div>

                      {/* Member Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="text-gray-900 font-medium truncate">
                            {member.name}
                          </h3>
                          <div className="flex items-center gap-1.5">
                            {getStatusIcon(member.status)}
                            <span
                              className="text-xs font-medium px-2.5 py-1 rounded-full"
                              style={{
                                backgroundColor: `${getRoleColor(member.role)}/15`,
                                color: getRoleColor(member.role),
                              }}
                            >
                              {member.role}
                            </span>
                            <span
                              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                                member.status === 'Active'
                                  ? 'bg-green-900/20 text-green-400'
                                  : member.status === 'Pending'
                                    ? 'bg-yellow-900/20 text-yellow-400'
                                    : 'bg-red-900/20 text-red-400'
                              }`}
                            >
                              {member.status}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1.5">
                            <Mail className="w-4 h-4" aria-hidden="true" />
                            <a href={`mailto:${member.email}`} className="hover:underline">
                              {member.email}
                            </a>
                          </span>
                          <span aria-hidden="true">•</span>
                          <span>{STRINGS.LAST_ACTIVE} {member.lastActive}</span>
                        </div>
                      </div>
                    </div>

                    {/* Right Side - Actions */}
                    <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                      <div className="text-right text-sm">
                        <p className="text-gray-500">{STRINGS.JOINED}</p>
                        <p className="text-gray-900 font-medium">{member.joinedDate}</p>
                      </div>

                      {/* Actions Dropdown */}
                      <div className="relative">
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() =>
                            setActiveDropdown(
                              activeDropdown === member.id ? null : member.id
                            )
                          }
                          className="p-2 hover:bg-gray-200 rounded-lg transition-colors duration-200"
                          aria-label={`Actions for ${member.name}`}
                          aria-expanded={activeDropdown === member.id}
                          aria-haspopup="menu"
                        >
                          <MoreHorizontal className="w-5 h-5 text-gray-500" aria-hidden="true" />
                        </motion.button>

                        {/* Dropdown Menu */}
                        {activeDropdown === member.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10"
                            role="menu"
                            aria-label={`Actions for ${member.name}`}
                          >
                            <div className="border-b border-gray-200 px-4 py-2">
                              <select
                                className="w-full text-sm text-gray-700 bg-transparent focus:outline-none"
                                defaultValue={member.role.toLowerCase().replace(/ /g, '_')}
                                onChange={(e) => handleEditRole(member.id, e.target.value)}
                                aria-label={`Change role for ${member.name}`}
                                role="menuitem"
                              >
                                <option value="viewer">Viewer</option>
                                <option value="editor">Finance Manager</option>
                                <option value="admin">Admin</option>
                              </select>
                            </div>
                            <button
                              onClick={() => handleRemoveUser(member.id)}
                              className="w-full text-left px-4 py-2.5 text-red-500 hover:text-red-600 hover:bg-gray-100 transition-colors duration-150 text-sm flex items-center gap-2"
                            >
                              <X className="w-4 h-4" />
                              Remove User
                            </button>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
              )}
            </div>

            {/* Pagination Controls */}
            <div className="px-6 py-4 flex justify-between items-center border-t border-gray-200">
              <div className="text-sm text-gray-500">
                {STRINGS.PAGE_INFO} {page + 1} • {STRINGS.SHOWING_MEMBERS} {PAGE_SIZE} {STRINGS.MEMBERS_PER_PAGE}
              </div>
              <div className="flex gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium rounded-lg transition-colors duration-200 disabled:opacity-50"
                  aria-label="Go to previous page"
                >
                  {STRINGS.PREVIOUS}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setPage(page + 1)}
                  disabled={!hasMore}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium rounded-lg transition-colors duration-200 disabled:opacity-50"
                  aria-label="Go to next page"
                >
                  {STRINGS.NEXT}
                </motion.button>
              </div>
            </div>
          </motion.div>

          {/* Invite Modal */}
          {showInviteModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
              onClick={() => setShowInviteModal(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ duration: 0.2 }}
                className="bg-white border border-gray-200 rounded-lg p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 className="text-xl font-bold text-gray-900 mb-4">{STRINGS.INVITE_USER_MODAL}</h2>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2" htmlFor="invite-email">
                      {STRINGS.EMAIL_ADDRESS}
                    </label>
                    <input
                      id="invite-email"
                      type="email"
                      placeholder="user@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-green-600 transition-colors duration-200"
                      style={{ '--focus-color': 'hsl(142 76% 36%)' } as any}
                      aria-required="true"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-2" htmlFor="invite-role">
                      {STRINGS.ROLE_LABEL}
                    </label>
                    <select
                      id="invite-role"
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:border-green-600 transition-colors duration-200"
                      aria-label="Select role for new user"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Finance Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 font-medium rounded-lg transition-colors duration-200"
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleInviteUser}
                    disabled={isSaving || !inviteEmail}
                    className="flex-1 px-4 py-2 text-white font-medium rounded-lg transition-colors duration-200 disabled:opacity-50"
                    style={{ backgroundColor: 'hsl(142 76% 36%)' }}
                    onHoverStart={(e) => {
                      if (e.currentTarget instanceof HTMLElement) {
                        e.currentTarget.style.backgroundColor = 'hsl(142 76% 45%)';
                      }
                    }}
                    onHoverEnd={(e) => {
                      if (e.currentTarget instanceof HTMLElement) {
                        e.currentTarget.style.backgroundColor = 'hsl(142 76% 36%)';
                      }
                    }}
                  >
                    {isSaving ? 'Sending...' : 'Send Invite'}
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
