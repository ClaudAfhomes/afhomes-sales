import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:afhomes_staff/main.dart';

void main() {
  testWidgets('renders staff authentication', (tester) async {
    FlutterSecureStorage.setMockInitialValues({});
    await tester.pumpWidget(const App());
    await tester.pumpAndSettle();
    expect(find.text('AFhomes Staff POS'), findsOneWidget);
    expect(find.text('Employee sign in'), findsOneWidget);
    expect(find.text('Sign in'), findsOneWidget);
  });
}
