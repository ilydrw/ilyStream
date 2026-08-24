// SPDX-License-Identifier: GPL-2.0-or-later
#include "bridge-peer-verifier.hpp"

#include <QByteArray>

#include <windows.h>

namespace ilystream::bridge_peer_verifier {
namespace {

constexpr DWORD kMaximumTokenInformationBytes = 64 * 1024;

class ScopedHandle final {
  public:
    explicit ScopedHandle(HANDLE handle = nullptr) : handle_(handle) {}
    ~ScopedHandle() {
        if (handle_ != nullptr && handle_ != INVALID_HANDLE_VALUE) {
            CloseHandle(handle_);
        }
    }

    ScopedHandle(const ScopedHandle&) = delete;
    ScopedHandle& operator=(const ScopedHandle&) = delete;

    [[nodiscard]] HANDLE get() const { return handle_; }
    [[nodiscard]] bool isValid() const { return handle_ != nullptr && handle_ != INVALID_HANDLE_VALUE; }

  private:
    HANDLE handle_;
};

bool readUserSid(HANDLE token, QByteArray& storage, PSID& sid) {
    DWORD requiredBytes = 0;
    if (GetTokenInformation(token, TokenUser, nullptr, 0, &requiredBytes) != FALSE ||
        GetLastError() != ERROR_INSUFFICIENT_BUFFER || requiredBytes == 0 ||
        requiredBytes > kMaximumTokenInformationBytes) {
        return false;
    }

    storage.resize(static_cast<qsizetype>(requiredBytes));
    if (GetTokenInformation(token, TokenUser, storage.data(), requiredBytes, &requiredBytes) == FALSE) {
        return false;
    }

    const auto* tokenUser = reinterpret_cast<const TOKEN_USER*>(storage.constData());
    sid = tokenUser->User.Sid;
    return sid != nullptr && IsValidSid(sid) != FALSE;
}

} // namespace

bool isSameUserProcess(quint32 processId) {
    if (processId == 0) {
        return false;
    }

    ScopedHandle process(OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId));
    if (!process.isValid()) {
        return false;
    }

    HANDLE currentTokenHandle = nullptr;
    if (OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &currentTokenHandle) == FALSE) {
        return false;
    }
    ScopedHandle currentToken(currentTokenHandle);

    HANDLE serverTokenHandle = nullptr;
    if (OpenProcessToken(process.get(), TOKEN_QUERY, &serverTokenHandle) == FALSE) {
        return false;
    }
    ScopedHandle serverToken(serverTokenHandle);

    QByteArray currentSidStorage;
    QByteArray serverSidStorage;
    PSID currentSid = nullptr;
    PSID serverSid = nullptr;
    if (!readUserSid(currentToken.get(), currentSidStorage, currentSid) ||
        !readUserSid(serverToken.get(), serverSidStorage, serverSid)) {
        return false;
    }

    return EqualSid(currentSid, serverSid) != FALSE;
}

bool isSameUserNamedPipeServer(qintptr pipeDescriptor) {
    if (pipeDescriptor == -1 || pipeDescriptor == 0) {
        return false;
    }

    ULONG serverProcessId = 0;
    const HANDLE pipeHandle = reinterpret_cast<HANDLE>(pipeDescriptor);
    if (GetNamedPipeServerProcessId(pipeHandle, &serverProcessId) == FALSE || serverProcessId == 0) {
        return false;
    }

    return isSameUserProcess(serverProcessId);
}

} // namespace ilystream::bridge_peer_verifier
