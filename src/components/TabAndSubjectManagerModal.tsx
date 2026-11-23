import React, { useState } from 'react';
import { NavTabItem, CustomSubject } from '../types/exam';
import { 
  X, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  RotateCcw, 
  Layers, 
  BookOpen, 
  Tag, 
  Settings,
  Sparkles
} from 'lucide-react';
import { 
  saveNavTabs, 
  resetDefaultNavTabs, 
  saveSubject, 
  updateSubjectName, 
  deleteSubject 
} from '../utils/storage';

interface TabAndSubjectManagerModalProps {
  isOpen: boolean;
  navTabs: NavTabItem[];
  subjects: CustomSubject[];
  onClose: () => void;
  onRefreshTabsAndSubjects: () => void;
}

export const TabAndSubjectManagerModal: React.FC<TabAndSubjectManagerModalProps> = ({
  isOpen,
  navTabs,
  subjects,
  onClose,
  onRefreshTabsAndSubjects,
}) => {
  if (!isOpen) return null;

  const [activeSubTab, setActiveSubTab] = useState<'tabs' | 'subjects'>('tabs');

  // Tabs management state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabLabel, setEditingTabLabel] = useState('');
  const [newTabLabel, setNewTabLabel] = useState('');
  const [newTabTarget, setNewTabTarget] = useState<NavTabItem['targetView']>('single');
  const [newTabIcon, setNewTabIcon] = useState<NavTabItem['iconName']>('book');

  // Subjects management state
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState('');
  const [newSubjectName, setNewSubjectName] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');

  // Tab operations
  const handleAddNewTab = () => {
    if (!newTabLabel.trim()) return;
    const resolvedIcon: NavTabItem['iconName'] =
      newTabTarget === 'games' ? 'gamepad' : newTabIcon;
    const newTab: NavTabItem = {
      id: 'tab_custom_' + Date.now(),
      label: newTabLabel.trim(),
      iconName: resolvedIcon,
      targetView: newTabTarget,
      isCustom: true,
    };
    const updated = [...navTabs, newTab];
    saveNavTabs(updated);
    onRefreshTabsAndSubjects();
    setNewTabLabel('');
  };

  const handleSaveEditTab = (tabId: string) => {
    if (!editingTabLabel.trim()) return;
    const updated = navTabs.map((t) => (t.id === tabId ? { ...t, label: editingTabLabel.trim() } : t));
    saveNavTabs(updated);
    onRefreshTabsAndSubjects();
    setEditingTabId(null);
  };

  const handleDeleteTab = (tabId: string) => {
    if (navTabs.length <= 1) return;
    const updated = navTabs.filter((t) => t.id !== tabId);
    saveNavTabs(updated);
    onRefreshTabsAndSubjects();
  };

  const handleResetTabs = () => {
    resetDefaultNavTabs();
    onRefreshTabsAndSubjects();
  };

  // Subject operations
  const handleAddNewSubject = () => {
    if (!newSubjectName.trim()) return;
    const id = 'subj_' + Date.now();
    const newSubj: CustomSubject = {
      id,
      name: newSubjectName.trim(),
      code: newSubjectCode.trim() || newSubjectName.trim().substring(0, 3).toUpperCase(),
      createdAt: new Date().toISOString().split('T')[0],
      color: 'blue',
      iconName: 'BookOpen',
    };
    saveSubject(newSubj);
    onRefreshTabsAndSubjects();
    setNewSubjectName('');
    setNewSubjectCode('');
  };

  const handleSaveEditSubject = (subjId: string) => {
    if (!editingSubjectName.trim()) return;
    updateSubjectName(subjId, editingSubjectName.trim());
    onRefreshTabsAndSubjects();
    setEditingSubjectId(null);
  };

  const handleDeleteSubject = (subjId: string) => {
    if (subjects.length <= 1) return;
    deleteSubject(subjId);
    onRefreshTabsAndSubjects();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-50 text-blue-700">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Tùy biến Tabs Điều hướng & Quản lý Danh mục Môn học
              </h2>
              <p className="text-xs text-slate-500">
                Chủ động thêm, xóa, sửa các thanh tab và tên môn học theo nhu cầu dạy & học
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Switcher Tab */}
        <div className="flex items-center gap-2 py-3 border-b border-slate-100 shrink-0 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveSubTab('tabs')}
            className={`py-1.5 px-3 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'tabs'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Quản lý Tabs ({navTabs.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('subjects')}
            className={`py-1.5 px-3 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'subjects'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Quản lý Môn học ({subjects.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="overflow-y-auto py-4 flex-1 space-y-6">
          {/* TAB MANAGEMENT */}
          {activeSubTab === 'tabs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Danh sách các thanh tab xuất hiện trên menu chính:</span>
                <button
                  type="button"
                  onClick={handleResetTabs}
                  className="text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Khôi phục Tabs mặc định</span>
                </button>
              </div>

              {/* Existing Tabs List */}
              <div className="space-y-2">
                {navTabs.map((tab) => {
                  const isEditing = editingTabId === tab.id;
                  return (
                    <div
                      key={tab.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3 text-xs"
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingTabLabel}
                            onChange={(e) => setEditingTabLabel(e.target.value)}
                            className="flex-1 px-2.5 py-1 text-xs bg-white border border-blue-400 rounded-lg focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEditTab(tab.id)}
                            className="p-1.5 bg-blue-600 text-white rounded-md cursor-pointer"
                            title="Lưu tên mới"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTabId(null)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{tab.label}</span>
                          <span className="text-[10px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                            Loại: {tab.targetView}
                          </span>
                        </div>
                      )}

                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTabId(tab.id);
                              setEditingTabLabel(tab.label);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                            title="Đổi tên tab"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {navTabs.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteTab(tab.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title="Xóa tab này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add New Tab Form */}
              <div className="p-4 bg-slate-100 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  + Thêm một Tab điều hướng mới
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Tên Tab</label>
                    <input
                      type="text"
                      value={newTabLabel}
                      onChange={(e) => setNewTabLabel(e.target.value)}
                      placeholder="Nhập tên Tab điều hướng mới..."
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Trang điều hướng</label>
                    <select
                      value={newTabTarget}
                      onChange={(e) => setNewTabTarget(e.target.value as NavTabItem['targetView'])}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none"
                    >
                      <option value="single">Đề thi theo môn lẻ</option>
                      <option value="bundle">Tổ hợp liên môn</option>
                      <option value="classrooms">Lớp học & Xếp hạng</option>
                      <option value="courses">Khóa học nhỏ</option>
                      <option value="battle">Đấu trường 1v1</option>
                      <option value="games">Trò chơi (Leo núi)</option>
                      <option value="analytics">Năng lực cá nhân</option>
                      <option value="history">Lịch sử thi</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddNewTab}
                  className="px-4 py-2 text-xs font-bold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Tạo Tab mới
                </button>
              </div>
            </div>
          )}

          {/* SUBJECTS MANAGEMENT */}
          {activeSubTab === 'subjects' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-500">
                Danh sách các môn học hỗ trợ trên hệ thống. Giáo viên có thể đổi tên môn hoặc thêm môn học mới theo chương trình:
              </div>

              {/* Existing Subjects List */}
              <div className="space-y-2">
                {subjects.map((subj) => {
                  const isEditing = editingSubjectId === subj.id;
                  return (
                    <div
                      key={subj.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex items-center justify-between gap-3 text-xs"
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingSubjectName}
                            onChange={(e) => setEditingSubjectName(e.target.value)}
                            className="flex-1 px-2.5 py-1 text-xs bg-white border border-blue-400 rounded-lg focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveEditSubject(subj.id)}
                            className="p-1.5 bg-blue-600 text-white rounded-md cursor-pointer"
                            title="Lưu tên mới"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingSubjectId(null)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{subj.name}</span>
                          {subj.code && (
                            <span className="text-[10px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                              Mã: {subj.code}
                            </span>
                          )}
                        </div>
                      )}

                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSubjectId(subj.id);
                              setEditingSubjectName(subj.name);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                            title="Sửa tên môn"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {subjects.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSubject(subj.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title="Xóa môn này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Add New Subject Form */}
              <div className="p-4 bg-slate-100 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                  + Thêm Môn học mới (Giáo viên tự nhập)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Tên môn học</label>
                    <input
                      type="text"
                      value={newSubjectName}
                      onChange={(e) => setNewSubjectName(e.target.value)}
                      placeholder="Nhập tên môn học mới..."
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-semibold">Mã viết tắt</label>
                    <input
                      type="text"
                      value={newSubjectCode}
                      onChange={(e) => setNewSubjectCode(e.target.value.toUpperCase())}
                      placeholder="Nhập mã viết tắt..."
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none uppercase font-mono"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddNewSubject}
                  className="px-4 py-2 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Thêm môn học ngay
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
