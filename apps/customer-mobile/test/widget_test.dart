import 'package:flutter_test/flutter_test.dart';
import 'package:afhomes_customer/main.dart';
void main(){testWidgets('renders customer membership actions',(tester)async{await tester.pumpWidget(const App());expect(find.text('AFhomes VIP'),findsOneWidget);expect(find.text('Activate VIP'),findsOneWidget);expect(find.text('Digital VIP Card'),findsOneWidget);});}
