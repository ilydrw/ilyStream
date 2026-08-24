// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include <QString>

namespace ilystream::bridge_credentials {

inline constexpr qsizetype kMaxCredentialBytes = 4 * 1024;

enum class LoadError {
    None,
    LocationUnavailable,
    Missing,
    Unreadable,
    Oversized,
    InvalidJson,
    InvalidSchema,
    IncompatibleProtocol,
    InvalidToken,
};

struct LoadResult {
    QString token;
    LoadError error = LoadError::None;

    [[nodiscard]] bool ok() const { return error == LoadError::None && !token.isEmpty(); }
};

[[nodiscard]] QString defaultPath();
[[nodiscard]] LoadResult load(const QString& path = {});
[[nodiscard]] QString statusDetail(LoadError error);

} // namespace ilystream::bridge_credentials
