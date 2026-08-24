// SPDX-License-Identifier: GPL-2.0-or-later
#pragma once

#include <QtGlobal>

namespace ilystream::bridge_peer_verifier {

[[nodiscard]] bool isSameUserProcess(quint32 processId);
[[nodiscard]] bool isSameUserNamedPipeServer(qintptr pipeDescriptor);

} // namespace ilystream::bridge_peer_verifier
