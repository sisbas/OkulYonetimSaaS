# Merge Button Policy

Merge button yalnızca aşağıdaki koşulların tamamı sağlandığında kullanılabilir kalmalıdır:

- Tüm required checks success.
- En az bir geçerli review var.
- Review thread'leri resolved.
- Stale approval yok.
- PR GitHub draft metadata açısından ready durumda.
- Branch up-to-date.
- Direct push ve admin bypass yolu kapalı.

Bu koşullardan biri eksikse merge NO-GO'dur.
