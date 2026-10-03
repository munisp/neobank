import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';

const Sidebar = ({ open, onClose, darkMode }) => {
  const location = useLocation();
  const [insuranceSubmenuOpen, setInsuranceSubmenuOpen] = useState(false);

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: 'layout-dashboard',
      current: location.pathname === '/dashboard' || location.pathname === '/'
    },
    {
      name: 'Banking',
      href: '/banking',
      icon: 'building-2',
      current: location.pathname === '/banking'
    },
    {
      name: 'Insurance',
      icon: 'shield-check',
      current: location.pathname.startsWith('/insurance'),
      submenu: [
        {
          name: 'Overview',
          href: '/insurance',
          icon: 'eye',
          current: location.pathname === '/insurance'
        },
        {
          name: 'Get Quote',
          href: '/insurance/quote',
          icon: 'calculator',
          current: location.pathname === '/insurance/quote'
        },
        {
          name: 'My Policies',
          href: '/insurance/policies',
          icon: 'file-text',
          current: location.pathname === '/insurance/policies'
        },
        {
          name: 'Claims',
          href: '/insurance/claims',
          icon: 'clipboard-list',
          current: location.pathname === '/insurance/claims'
        }
      ]
    },
    {
      name: 'Apps for You',
      href: '/store',
      icon: 'layout-grid',
      current: location.pathname === '/store'
    },
    {
      name: 'Transfers',
      href: '/transfers',
      icon: 'arrow-right-left',
      current: location.pathname === '/transfers'
    },
    {
      name: 'Investments',
      href: '/investments',
      icon: 'trending-up',
      current: location.pathname === '/investments'
    },
    {
      name: 'Cards',
      href: '/cards',
      icon: 'credit-card',
      current: location.pathname === '/cards'
    }
  ];

  const bottomNavigation = [
    {
      name: 'Profile',
      href: '/profile',
      icon: 'user',
      current: location.pathname === '/profile'
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: 'settings',
      current: location.pathname === '/settings'
    }
  ];

  const handleInsuranceClick = () => {
    setInsuranceSubmenuOpen(!insuranceSubmenuOpen);
  };

  const NavItem = ({ item, isBottom = false }) => {
    if (item.submenu) {
      return (
        <div>
          <button
            onClick={handleInsuranceClick}
            className={`group flex items-center w-full px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
              item.current
                ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-900 dark:text-primary-100'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <i
              data-lucide={item.icon}
              className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors duration-200 ${
                item.current
                  ? 'text-primary-500 dark:text-primary-400'
                  : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'
              }`}
            ></i>
            <span className="flex-1">{item.name}</span>
            <i
              data-lucide="chevron-down"
              className={`ml-3 h-4 w-4 transition-transform duration-200 ${
                insuranceSubmenuOpen ? 'rotate-180' : ''
              }`}
            ></i>
          </button>
          
          {/* Submenu */}
          <div className={`mt-1 space-y-1 transition-all duration-200 ${
            insuranceSubmenuOpen ? 'block' : 'hidden'
          }`}>
            {item.submenu.map((subItem) => (
              <Link
                key={subItem.name}
                to={subItem.href}
                onClick={onClose}
                className={`group flex items-center w-full pl-8 pr-2 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
                  subItem.current
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <i
                  data-lucide={subItem.icon}
                  className={`mr-3 h-4 w-4 flex-shrink-0 transition-colors duration-200 ${
                    subItem.current
                      ? 'text-primary-500 dark:text-primary-400'
                      : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'
                  }`}
                ></i>
                {subItem.name}
              </Link>
            ))}
          </div>
        </div>
      );
    }

    return (
      <Link
        to={item.href}
        onClick={onClose}
        className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200 ${
          item.current
            ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-900 dark:text-primary-100'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
        }`}
      >
        <i
          data-lucide={item.icon}
          className={`mr-3 h-5 w-5 flex-shrink-0 transition-colors duration-200 ${
            item.current
              ? 'text-primary-500 dark:text-primary-400'
              : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'
          }`}
        ></i>
        {item.name}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={onClose}
        >
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75"></div>
        </div>
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="h-8 w-8 bg-gradient-to-br from-primary-500 to-primary-600 rounded-lg flex items-center justify-center">
                <i data-lucide="shield-check" className="h-5 w-5 text-white"></i>
              </div>
              <div className="ml-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white font-display">
                  Etherisc
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Neobank
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <i data-lucide="x" className="h-5 w-5"></i>
            </button>
          </div>

          {/* Navigation */}
          <div className="flex-1 flex flex-col overflow-y-auto">
            <nav className="flex-1 px-4 py-4 space-y-1">
              {navigation.map((item) => (
                <NavItem key={item.name} item={item} />
              ))}
            </nav>

            {/* Bottom navigation */}
            <nav className="px-4 py-4 border-t border-gray-200 dark:border-gray-700 space-y-1">
              {bottomNavigation.map((item) => (
                <NavItem key={item.name} item={item} isBottom />
              ))}
            </nav>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="h-10 w-10 bg-gradient-to-br from-green-400 to-green-500 rounded-full flex items-center justify-center">
                <i data-lucide="zap" className="h-5 w-5 text-white"></i>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Blockchain Powered
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Secure & Transparent
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;

