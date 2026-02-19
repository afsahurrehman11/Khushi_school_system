/**
 * WhatsApp Bot & Alerts Dashboard
 * Complete admin interface for sending WhatsApp messages
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Send,
  RefreshCw,
  Users,
  School,
  BookOpen,
  User,
  Search,
  Eye,
  CheckCircle,
  XCircle,
  Loader2,
  History,
  BarChart3,
} from 'lucide-react';
import Button from '../../../components/Button';
import Badge from '../../../components/Badge';
import Modal from '../../../components/Modal';
import {
  getWhatsAppStatus,
  reconnectWhatsApp,
  sendMessage,
  getTemplates,
  getRecipients,
  getMessageLogs,
  getMessageStats,
} from '../services/whatsappApi';
import { apiCallJSON } from '../../../utils/api';
import {
  WhatsAppStatus,
  WhatsAppTemplate,
  Recipient,
  WhatsAppLog,
  WhatsAppStats,
} from '../types';
import logger from '../../../utils/logger';

const WhatsAppDashboard: React.FC = () => {
  // Connection status
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);

  // Message composer
  const [messageType, setMessageType] = useState<'custom' | 'template'>('custom');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [messageContent, setMessageContent] = useState('');
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);

  // Recipients
  const [recipientType, setRecipientType] = useState<string>('entire_school');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedSection, setSelectedSection] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [sectionsForClass, setSectionsForClass] = useState<string[]>([]);

  // Scheduling
  const [scheduleType, setScheduleType] = useState<'now' | 'later'>('now');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  // Sending state
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<any>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  // History / Stats
  const [showHistory, setShowHistory] = useState(false);
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [stats, setStats] = useState<WhatsAppStats | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  // Fetch initial data
  useEffect(() => {
    fetchStatus();
    fetchTemplates();
    fetchClasses();
  }, []);

  // Fetch recipients when filters change
  useEffect(() => {
    if (recipientType !== 'specific_students' || !selectedClass) {
      fetchRecipients();
    }
  }, [recipientType, selectedClass, selectedSection]);

  // Extract sections when class changes
  useEffect(() => {
    if (selectedClass) {
      const classObj = classes.find(c => c.id === selectedClass || c._id === selectedClass);
      if (classObj) {
        const sameName = classes.filter(c => c.class_name === classObj.class_name);
        const sections = Array.from(new Set(sameName.map(c => c.section).filter(Boolean)));
        setSectionsForClass(sections.length > 0 ? sections : ['A']);
      }
    } else {
      setSectionsForClass([]);
    }
    setSelectedSection('');
    setSelectedStudentIds(new Set());
  }, [selectedClass, classes]);

  const fetchStatus = async () => {
    setStatusLoading(true);
    try {
      const data = await getWhatsAppStatus();
      setStatus(data);
    } catch (err) {
      logger.error('WHATSAPP', `Failed to fetch status: ${err}`);
    } finally {
      setStatusLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const data = await getTemplates();
      setTemplates(data.templates || []);
    } catch (err) {
      logger.error('WHATSAPP', `Failed to fetch templates: ${err}`);
    }
  };

  const fetchClasses = async () => {
    try {
      const data = await apiCallJSON('/api/classes');
      const list = (data || []).map((c: any) => ({
        id: c.id || c._id,
        class_name: c.class_name || c.name,
        section: c.section,
      }));
      setClasses(list);
    } catch (err) {
      logger.error('WHATSAPP', `Failed to fetch classes: ${err}`);
    }
  };

  const fetchRecipients = async () => {
    setRecipientsLoading(true);
    try {
      const data = await getRecipients(
        recipientType,
        selectedClass || undefined,
        selectedSection || undefined,
        recipientSearch || undefined
      );
      setRecipients(data.recipients || []);
    } catch (err) {
      logger.error('WHATSAPP', `Failed to fetch recipients: ${err}`);
    } finally {
      setRecipientsLoading(false);
    }
  };

  const fetchLogs = async () => {
    setLogsLoading(true);
    try {
      const [logsData, statsData] = await Promise.all([
        getMessageLogs(0, 50),
        getMessageStats(),
      ]);
      setLogs(logsData.logs || []);
      setStats(statsData);
    } catch (err) {
      logger.error('WHATSAPP', `Failed to fetch logs: ${err}`);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      const result = await reconnectWhatsApp();
      setStatus(result.status);
    } catch (err) {
      logger.error('WHATSAPP', `Reconnect failed: ${err}`);
    } finally {
      setReconnecting(false);
    }
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setMessageContent(template.content);
    }
  };

  const handleSelectAll = () => {
    const validRecipients = recipients.filter(r => r.phone_valid && r.whatsapp_opt_in);
    if (selectedStudentIds.size === validRecipients.length) {
      setSelectedStudentIds(new Set());
    } else {
      setSelectedStudentIds(new Set(validRecipients.map(r => r.id)));
    }
  };

  const handleStudentToggle = (studentId: string) => {
    const newSet = new Set(selectedStudentIds);
    if (newSet.has(studentId)) {
      newSet.delete(studentId);
    } else {
      newSet.add(studentId);
    }
    setSelectedStudentIds(newSet);
  };

  const handleSend = async () => {
    if (!messageContent.trim()) {
      alert('Please enter a message');
      return;
    }

    // Validate recipients
    if (recipientType === 'specific_students' && selectedStudentIds.size === 0) {
      alert('Please select at least one student');
      return;
    }

    if ((recipientType === 'specific_class' || recipientType === 'specific_section') && !selectedClass) {
      alert('Please select a class');
      return;
    }

    setSending(true);
    try {
      const request: any = {
        message: messageContent,
        template_type: messageType === 'template' ? selectedTemplate : undefined,
        recipient_type: recipientType,
        class_id: selectedClass || undefined,
        section_id: selectedSection || undefined,
        student_ids: recipientType === 'specific_students' ? Array.from(selectedStudentIds) : undefined,
      };

      // Add schedule time if scheduling
      if (scheduleType === 'later' && scheduleDate && scheduleTime) {
        const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
        request.schedule_time = scheduledDateTime.toISOString();
      }

      const result = await sendMessage(request);
      setSendResult(result);
      setShowResultModal(true);

      // Reset form on success
      if (result.success) {
        setMessageContent('');
        setSelectedTemplate('');
        setSelectedStudentIds(new Set());
      }
    } catch (err: any) {
      setSendResult({ success: false, error: err.message || 'Failed to send message' });
      setShowResultModal(true);
    } finally {
      setSending(false);
    }
  };

  // Filter recipients based on search
  const filteredRecipients = useMemo(() => {
    if (!recipientSearch) return recipients;
    const q = recipientSearch.toLowerCase();
    return recipients.filter(
      r =>
        r.full_name?.toLowerCase().includes(q) ||
        r.student_id?.toLowerCase().includes(q) ||
        r.parent_phone?.includes(q)
    );
  }, [recipients, recipientSearch]);

  const validRecipientCount = useMemo(() => {
    if (recipientType === 'specific_students') {
      return selectedStudentIds.size;
    }
    return filteredRecipients.filter(r => r.phone_valid && r.whatsapp_opt_in).length;
  }, [filteredRecipients, recipientType, selectedStudentIds]);

  // Get unique class names for dropdown
  const uniqueClasses = useMemo(() => {
    const map = new Map<string, any>();
    classes.forEach(c => {
      if (!map.has(c.class_name)) {
        map.set(c.class_name, c);
      }
    });
    return Array.from(map.values());
  }, [classes]);

  return (
    <div className="min-h-screen bg-secondary-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow-soft p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-secondary-900">WhatsApp Bot & Alerts</h1>
                <p className="text-secondary-500 text-sm">Send notifications to students and parents</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Status indicator */}
              <div className="flex items-center gap-2">
                {statusLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-secondary-400" />
                ) : status?.connected ? (
                  <>
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-sm text-green-600 font-medium">Connected</span>
                  </>
                ) : (
                  <>
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    <span className="text-sm text-red-600 font-medium">Not Connected</span>
                  </>
                )}
              </div>

              <Button
                variant="ghost"
                onClick={handleReconnect}
                disabled={reconnecting}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${reconnecting ? 'animate-spin' : ''}`} />
                Reconnect
              </Button>

              <Button
                variant="ghost"
                onClick={() => {
                  setShowHistory(!showHistory);
                  if (!showHistory) fetchLogs();
                }}
                className="flex items-center gap-2"
              >
                <History className="w-4 h-4" />
                History
              </Button>
            </div>
          </div>
        </div>

        {/* History Panel */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-white rounded-xl shadow-soft overflow-hidden"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-secondary-900">Message History</h2>
                  {stats && (
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-secondary-500">
                        Total: <strong>{stats.total_messages}</strong>
                      </span>
                      <span className="text-green-600">
                        Sent: <strong>{stats.sent}</strong>
                      </span>
                      <span className="text-yellow-600">
                        Scheduled: <strong>{stats.scheduled}</strong>
                      </span>
                      <span className="text-red-600">
                        Failed: <strong>{stats.failed}</strong>
                      </span>
                    </div>
                  )}
                </div>

                {logsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                  </div>
                ) : logs.length === 0 ? (
                  <p className="text-center text-secondary-500 py-8">No messages sent yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-secondary-200">
                          <th className="text-left py-2 px-3 text-secondary-600">Date</th>
                          <th className="text-left py-2 px-3 text-secondary-600">Message</th>
                          <th className="text-left py-2 px-3 text-secondary-600">Recipients</th>
                          <th className="text-left py-2 px-3 text-secondary-600">Status</th>
                          <th className="text-left py-2 px-3 text-secondary-600">Sent By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.slice(0, 10).map(log => (
                          <tr key={log.id} className="border-b border-secondary-100 hover:bg-secondary-50">
                            <td className="py-2 px-3 text-secondary-700">
                              {new Date(log.created_at).toLocaleDateString()}
                            </td>
                            <td className="py-2 px-3 text-secondary-700 max-w-xs truncate">
                              {log.message}
                            </td>
                            <td className="py-2 px-3 text-secondary-700">{log.recipients_count}</td>
                            <td className="py-2 px-3">
                              <Badge
                                label={
                                  log.status
                                }
                                color={
                                  log.status === 'sent'
                                    ? 'success'
                                    : log.status === 'failed'
                                    ? 'danger'
                                    : log.status === 'scheduled'
                                    ? 'warning'
                                    : 'secondary'
                                }
                              />
                            </td>
                            <td className="py-2 px-3 text-secondary-500">{log.sent_by}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Message Composer */}
          <div className="lg:col-span-2 space-y-6">
            {/* Message Type */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <h2 className="text-lg font-semibold text-secondary-900 mb-4">Compose Message</h2>

              {/* Message Type Toggle */}
              <div className="flex items-center gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="messageType"
                    checked={messageType === 'custom'}
                    onChange={() => {
                      setMessageType('custom');
                      setMessageContent('');
                      setSelectedTemplate('');
                    }}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="text-sm text-secondary-700">Custom Message</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="messageType"
                    checked={messageType === 'template'}
                    onChange={() => setMessageType('template')}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="text-sm text-secondary-700">Use Template</span>
                </label>
              </div>

              {/* Template Selector */}
              {messageType === 'template' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-secondary-700 mb-1">
                    Select Template
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={e => handleTemplateChange(e.target.value)}
                    className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                  >
                    <option value="">Choose a template...</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Message Content */}
              <div>
                <label className="block text-sm font-medium text-secondary-700 mb-1">
                  Message Content
                </label>
                <textarea
                  value={messageContent}
                  onChange={e => setMessageContent(e.target.value)}
                  rows={6}
                  placeholder="Type your message here..."
                  className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
                />
                <p className="text-xs text-secondary-500 mt-1">
                  {messageContent.length} characters
                </p>
              </div>
            </div>

            {/* Recipients Section */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <h2 className="text-lg font-semibold text-secondary-900 mb-4">Select Recipients</h2>

              {/* Recipient Type */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { value: 'entire_school', label: 'Entire School', icon: School },
                  { value: 'specific_class', label: 'Specific Class', icon: BookOpen },
                  { value: 'specific_section', label: 'Specific Section', icon: Users },
                  { value: 'specific_students', label: 'Select Students', icon: User },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setRecipientType(opt.value);
                      setSelectedStudentIds(new Set());
                    }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all ${
                      recipientType === opt.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-secondary-200 hover:border-secondary-300 text-secondary-600'
                    }`}
                  >
                    <opt.icon className="w-5 h-5" />
                    <span className="text-xs font-medium text-center">{opt.label}</span>
                  </button>
                ))}
              </div>

              {/* Class/Section Selectors */}
              {(recipientType === 'specific_class' ||
                recipientType === 'specific_section' ||
                recipientType === 'specific_students') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 mb-1">Class</label>
                    <select
                      value={selectedClass}
                      onChange={e => setSelectedClass(e.target.value)}
                      className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    >
                      <option value="">Select class...</option>
                      {uniqueClasses.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.class_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(recipientType === 'specific_section' || recipientType === 'specific_students') &&
                    sectionsForClass.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-secondary-700 mb-1">
                          Section
                        </label>
                        <select
                          value={selectedSection}
                          onChange={e => setSelectedSection(e.target.value)}
                          className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                        >
                          <option value="">All Sections</option>
                          {sectionsForClass.map(s => (
                            <option key={s} value={s}>
                              Section {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                </div>
              )}

              {/* Student List for specific_students */}
              {recipientType === 'specific_students' && selectedClass && (
                <div className="border border-secondary-200 rounded-lg overflow-hidden">
                  {/* Search & Select All */}
                  <div className="flex items-center gap-3 p-3 bg-secondary-50 border-b border-secondary-200">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-secondary-400" />
                      <input
                        type="text"
                        placeholder="Search students..."
                        value={recipientSearch}
                        onChange={e => setRecipientSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-secondary-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      />
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                      {selectedStudentIds.size ===
                      filteredRecipients.filter(r => r.phone_valid && r.whatsapp_opt_in).length
                        ? 'Deselect All'
                        : 'Select All'}
                    </Button>
                  </div>

                  {/* Student Table */}
                  <div className="max-h-64 overflow-y-auto">
                    {recipientsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
                      </div>
                    ) : filteredRecipients.length === 0 ? (
                      <p className="text-center text-secondary-500 py-8">No students found</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-secondary-50 sticky top-0">
                          <tr>
                            <th className="w-10 py-2 px-3"></th>
                            <th className="text-left py-2 px-3 text-secondary-600">Name</th>
                            <th className="text-left py-2 px-3 text-secondary-600">Class</th>
                            <th className="text-left py-2 px-3 text-secondary-600">Section</th>
                            <th className="text-left py-2 px-3 text-secondary-600">Parent Phone</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredRecipients.map(student => (
                            <tr
                              key={student.id}
                              className={`border-b border-secondary-100 hover:bg-secondary-50 ${
                                !student.phone_valid || !student.whatsapp_opt_in ? 'opacity-50' : ''
                              }`}
                            >
                              <td className="py-2 px-3">
                                <input
                                  type="checkbox"
                                  checked={selectedStudentIds.has(student.id)}
                                  onChange={() => handleStudentToggle(student.id)}
                                  disabled={!student.phone_valid || !student.whatsapp_opt_in}
                                  className="w-4 h-4 text-primary-600 rounded"
                                />
                              </td>
                              <td className="py-2 px-3 text-secondary-700">{student.full_name}</td>
                              <td className="py-2 px-3 text-secondary-500">{student.class_id}</td>
                              <td className="py-2 px-3 text-secondary-500">{student.section}</td>
                              <td className="py-2 px-3">
                                <span
                                  className={
                                    student.phone_valid ? 'text-secondary-700' : 'text-red-500'
                                  }
                                >
                                  {student.parent_phone}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* Recipient Count */}
              <div className="mt-4 flex items-center gap-2 text-sm text-secondary-600">
                <Users className="w-4 h-4" />
                <span>
                  <strong className="text-secondary-900">{validRecipientCount}</strong> valid
                  recipients selected
                </span>
              </div>
            </div>

            {/* Scheduling Section */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <h2 className="text-lg font-semibold text-secondary-900 mb-4">Schedule</h2>

              <div className="flex items-center gap-6 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scheduleType"
                    checked={scheduleType === 'now'}
                    onChange={() => setScheduleType('now')}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="text-sm text-secondary-700">Send Now</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scheduleType"
                    checked={scheduleType === 'later'}
                    onChange={() => setScheduleType('later')}
                    className="w-4 h-4 text-primary-600"
                  />
                  <span className="text-sm text-secondary-700">Schedule Later</span>
                </label>
              </div>

              {scheduleType === 'later' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 mb-1">Date</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      onChange={e => setScheduleDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-secondary-700 mb-1">Time</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                      className="w-full px-3 py-2 border border-secondary-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Preview & Send */}
          <div className="space-y-6">
            {/* Preview */}
            <div className="bg-white rounded-xl shadow-soft p-6">
              <h2 className="text-lg font-semibold text-secondary-900 mb-4 flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Preview
              </h2>

              {/* WhatsApp-style preview */}
              <div className="bg-[#e5ddd5] rounded-lg p-4 min-h-[200px]">
                <div className="bg-[#dcf8c6] rounded-lg p-3 max-w-[85%] ml-auto shadow">
                  {messageContent ? (
                    <p className="text-sm text-secondary-800 whitespace-pre-wrap">{messageContent}</p>
                  ) : (
                    <p className="text-sm text-secondary-400 italic">Your message will appear here...</p>
                  )}
                  <div className="text-xs text-secondary-500 text-right mt-1">
                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            </div>

            {/* Send Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSend}
              disabled={sending || !messageContent.trim() || validRecipientCount === 0}
              className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all ${
                sending || !messageContent.trim() || validRecipientCount === 0
                  ? 'bg-secondary-200 text-secondary-500 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white shadow-lg'
              }`}
            >
              {sending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  {scheduleType === 'later' ? 'Schedule Alert' : 'Send WhatsApp Alert'}
                </>
              )}
            </motion.button>

            {/* Quick Stats */}
            {stats && (
              <div className="bg-white rounded-xl shadow-soft p-6">
                <h3 className="text-sm font-medium text-secondary-700 mb-3 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Quick Stats
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-green-600">{stats.sent}</p>
                    <p className="text-xs text-green-700">Sent</p>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-yellow-600">{stats.scheduled}</p>
                    <p className="text-xs text-yellow-700">Scheduled</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-blue-600">{stats.total_recipients}</p>
                    <p className="text-xs text-blue-700">Recipients</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
                    <p className="text-xs text-red-700">Failed</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Result Modal */}
      <Modal
        isOpen={showResultModal}
        onClose={() => setShowResultModal(false)}
        title={sendResult?.success ? 'Message Sent' : 'Send Failed'}
        size="sm"
      >
        <div className="text-center py-4">
          {sendResult?.success ? (
            <>
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-secondary-700">
                {sendResult.scheduled
                  ? `Message scheduled for ${new Date(sendResult.scheduled_for).toLocaleString()}`
                  : `Successfully sent to ${sendResult.success || sendResult.total || validRecipientCount} recipients`}
              </p>
              {sendResult.failed > 0 && (
                <p className="text-yellow-600 text-sm mt-2">({sendResult.failed} failed to send)</p>
              )}
            </>
          ) : (
            <>
              <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
              <p className="text-secondary-700">{sendResult?.error || 'Failed to send message'}</p>
            </>
          )}
        </div>
        <div className="flex justify-center mt-4">
          <Button onClick={() => setShowResultModal(false)}>Close</Button>
        </div>
      </Modal>
    </div>
  );
};

export default WhatsAppDashboard;
