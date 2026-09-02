#if defined(__APPLE__)

#include "native_window.h"

#import <Cocoa/Cocoa.h>

@interface IlyNativeUiDelegate : NSObject <NSApplicationDelegate>
@property(nonatomic, strong) NSWindow* window;
@end

@implementation IlyNativeUiDelegate
- (void)applicationDidFinishLaunching:(NSNotification*)notification {
    (void)notification;
    NSRect frame = NSMakeRect(0, 0, 720, 460);
    self.window = [[NSWindow alloc]
        initWithContentRect:frame
                  styleMask:(NSWindowStyleMaskTitled | NSWindowStyleMaskClosable |
                             NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable)
                    backing:NSBackingStoreBuffered
                      defer:NO];
    [self.window setTitle:@"ilyStream Health Center"];
    [self.window center];

    NSTextField* title = [[NSTextField alloc] initWithFrame:NSMakeRect(32, 355, 640, 40)];
    [title setStringValue:@"ilyStream Health Center"];
    [title setFont:[NSFont systemFontOfSize:28 weight:NSFontWeightSemibold]];
    [title setBezeled:NO];
    [title setDrawsBackground:NO];
    [title setEditable:NO];
    [title setSelectable:NO];
    [[self.window contentView] addSubview:title];

    NSTextField* detail = [[NSTextField alloc] initWithFrame:NSMakeRect(32, 245, 640, 90)];
    [detail setStringValue:@"Native UI pilot — Cocoa-rendered diagnostics\n\n"
                             @"The same dependency-free C++ state contract is shared across platforms."];
    [detail setFont:[NSFont systemFontOfSize:16]];
    [detail setBezeled:NO];
    [detail setDrawsBackground:NO];
    [detail setEditable:NO];
    [detail setSelectable:NO];
    [[self.window contentView] addSubview:detail];

    [self.window makeKeyAndOrderFront:nil];
}
@end

namespace ily::ui {

bool RunNativeWindow(const UiState&, std::string& error) {
    @autoreleasepool {
        NSApplication* application = [NSApplication sharedApplication];
        IlyNativeUiDelegate* delegate = [[IlyNativeUiDelegate alloc] init];
        [application setDelegate:delegate];
        [application setActivationPolicy:NSApplicationActivationPolicyRegular];
        [application run];
    }
    error.clear();
    return true;
}

} // namespace ily::ui

#endif
