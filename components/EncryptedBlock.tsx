import * as React from 'react'
import { useState, useEffect } from 'react'

interface EncryptedBlockProps {
  content: string;
  password?: string;
}

export const EncryptedBlock: React.FC<EncryptedBlockProps> = ({ 
  content, 
  password = "password123"  // 默认密码，可以修改
}) => {
  const [inputPassword, setInputPassword] = useState('')
  const [isRevealed, setIsRevealed] = useState(false)
  const [error, setError] = useState('')
  const [isBrowser, setIsBrowser] = useState(false)
  
  // 确保只在浏览器环境中运行
  useEffect(() => {
    setIsBrowser(true)
    
    // 尝试从会话存储中恢复状态
    try {
      const key = `revealed-${btoa(content.substring(0, 20))}`
      const revealed = sessionStorage.getItem(key) === 'true'
      if (revealed) {
        setIsRevealed(true)
      }
    } catch (e) {
      // 忽略错误
    }
  }, [content])
  
  const handleUnlock = () => {
    if (inputPassword === password) {
      setIsRevealed(true)
      setError('')
      
      // 保存到会话存储
      try {
        const key = `revealed-${btoa(content.substring(0, 20))}`
        sessionStorage.setItem(key, 'true')
      } catch (e) {
        // 忽略错误
      }
    } else {
      setError('密码不正确')
    }
  }
  
  // 样式对象
  const styles = {
    encryptedBlock: {
      border: '1px solid #e2e8f0',
      borderRadius: '0.5rem',
      padding: '1.5rem',
      margin: '1rem 0',
      backgroundColor: '#f8fafc',
      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
    },
    lockIcon: {
      fontSize: '1.5rem',
      marginBottom: '0.5rem'
    },
    encryptedLabel: {
      marginBottom: '1rem',
      fontWeight: 500
    },
    formGroup: {
      display: 'flex',
      gap: '0.5rem',
      marginBottom: '0.5rem'
    },
    passwordInput: {
      flex: 1,
      padding: '0.5rem 0.75rem',
      border: '1px solid #cbd5e1',
      borderRadius: '0.375rem'
    },
    decryptButton: {
      backgroundColor: '#3b82f6',
      color: 'white',
      fontWeight: 500,
      padding: '0.5rem 1rem',
      border: 'none',
      borderRadius: '0.375rem',
      cursor: 'pointer'
    },
    errorMessage: {
      color: '#ef4444',
      marginTop: '0.5rem',
      fontSize: '0.875rem'
    },
    revealedContent: {
      padding: '0.5rem',
      borderLeft: '3px solid #3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.05)'
    }
  }
  
  // 服务器端渲染时返回占位符
  if (!isBrowser) {
    return <div>Loading...</div>
  }
  
  if (isRevealed) {
    return <div style={styles.revealedContent}>{content}</div>
  }
  
  return (
    <div style={styles.encryptedBlock}>
      <div style={styles.lockIcon}>🔒</div>
      <p style={styles.encryptedLabel}>加密内容</p>
      <div style={styles.formGroup}>
        <input
          type="password"
          value={inputPassword}
          onChange={(e) => setInputPassword(e.target.value)}
          placeholder="输入密码查看内容"
          style={styles.passwordInput}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleUnlock()
            }
          }}
        />
        <button 
          onClick={handleUnlock}
          style={styles.decryptButton}
        >
          解锁
        </button>
      </div>
      {error && <p style={styles.errorMessage}>{error}</p>}
    </div>
  )
}
