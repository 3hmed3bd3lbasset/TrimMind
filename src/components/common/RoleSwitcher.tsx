import React, { useState } from 'react';
import { useSalonStore } from '../../lib/store';
import { UserRole } from '../../types';
import { Shield, User, UserCheck, Sparkles, Building2, ChevronUp, ChevronDown, Scissors } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

export const RoleSwitcher: React.FC = () => {
  const {
    currentUser,
    switchRole,
    branches,
    selectedBranchId,
    setSelectedBranchId,
    isAiDrawerOpen,
  } = useSalonStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  // If AI Chat Drawer is open, hide the floating switcher
  if (isAiDrawerOpen) {
    return null;
  }

  const handleRoleChange = (role: UserRole) => {
    switchRole(role);
    if (role === 'customer') {
      if (
        location.pathname.includes('receptionist') ||
        location.pathname.includes('manager') ||
        location.pathname.includes('barber')
      ) {
        navigate('/');
      }
    } else if (role === 'receptionist') {
      navigate('/receptionist');
    } else if (role === 'manager') {
      navigate('/manager');
    } else if (role === 'barber') {
      navigate('/barber');
    }
  };

  return (
    <div className="fixed bottom-2.5 right-2.5 sm:bottom-5 sm:right-5 z-40 max-w-[calc(100vw-1.25rem)] overflow-x-auto no-scrollbar flex items-center gap-1.5 sm:gap-2 bg-white/95 backdrop-blur-md border border-border px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full shadow-clinic-3 text-[11px] sm:text-xs text-ink transition-all">
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center gap-1 pl-1.5 sm:pl-2 border-l border-border hover:text-forest transition-colors font-bold shrink-0"
        title={isCollapsed ? 'توسيع شريط الأدوار' : 'تصغير شريط الأدوار'}
      >
        <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-forest" />
        <span className="text-forest hidden sm:inline">الحساب:</span>
        {isCollapsed ? <ChevronUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
      </button>

      {!isCollapsed && (
        <>
          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <button
              onClick={() => handleRoleChange('customer')}
              className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full font-bold transition-all ${
                currentUser.role === 'customer'
                  ? 'bg-forest text-paper shadow-sm'
                  : 'text-ink-soft hover:bg-paper-warm'
              }`}
              title="تجربة كعميل صالون"
            >
              <User className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>عميل</span>
            </button>

            <button
              onClick={() => handleRoleChange('barber')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full font-bold transition-all ${
                currentUser.role === 'barber'
                  ? 'bg-forest text-paper shadow-sm'
                  : 'text-ink-soft hover:bg-paper-warm'
              }`}
              title="شاشة كابتن الحلاقة"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span>كابتن</span>
            </button>

            <button
              onClick={() => handleRoleChange('receptionist')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full font-bold transition-all ${
                currentUser.role === 'receptionist'
                  ? 'bg-terra text-paper shadow-sm'
                  : 'text-ink-soft hover:bg-paper-warm'
              }`}
              title="شاشة موظف الاستقبال"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>استقبال</span>
            </button>

            <button
              onClick={() => handleRoleChange('manager')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full font-bold transition-all ${
                currentUser.role === 'manager'
                  ? 'bg-ink text-paper shadow-sm'
                  : 'text-ink-soft hover:bg-paper-warm'
              }`}
              title="لوحة تحكم المدير العام"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>مدير</span>
            </button>
          </div>

          {currentUser.role === 'manager' && (
            <div className="flex items-center gap-1 pr-2 border-r border-border">
              <Shield className="w-3.5 h-3.5 text-forest" />
              <select
                value={currentUser.id}
                onChange={(e) => {
                  const targetProfile = useSalonStore.getState().profiles.find((p) => p.id === e.target.value);
                  if (targetProfile) {
                    useSalonStore.getState().setCurrentUser(targetProfile);
                  }
                }}
                className="bg-paper-warm text-ink text-[11px] font-bold rounded-lg px-2 py-1 border border-border outline-none focus:border-forest cursor-pointer max-w-[150px] truncate"
                title="التبديل بين المدير الأساسي ومديري الفروع والشركاء"
              >
                {useSalonStore.getState().profiles.filter((p) => p.role === 'manager').map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {currentUser.role === 'receptionist' && (
            <div className="flex items-center gap-1 pr-2 border-r border-border">
              <Building2 className="w-3.5 h-3.5 text-terra" />
              <select
                value={selectedBranchId}
                onChange={(e) => {
                  const bId = e.target.value;
                  setSelectedBranchId(bId);
                  const matchingRecep = useSalonStore.getState().profiles.find((p) => p.role === 'receptionist' && p.branch_id === bId);
                  if (matchingRecep) {
                    useSalonStore.getState().setCurrentUser(matchingRecep);
                  }
                }}
                className="bg-paper-warm text-ink text-[11px] font-bold rounded-lg px-2 py-1 border border-border outline-none focus:border-forest cursor-pointer max-w-[140px] truncate"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
    </div>
  );
};
