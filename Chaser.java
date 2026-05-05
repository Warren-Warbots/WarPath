package frc.robot.autos;

import edu.wpi.first.math.geometry.Pose2d;
import edu.wpi.first.math.util.Units;
import edu.wpi.first.wpilibj2.command.Command;
import frc.robot.intake.IntakeState;
import frc.robot.robot_manager.RobotState;

import static edu.wpi.first.wpilibj2.command.Commands.*;

public class Chaser extends WarbotAuto {

    private static final Pose2d[] UNDER_TRENCH   = { new Pose2d(4.560, 0.722, Rotation2d.fromDegrees(0.0)), new Pose2d(5.907, 0.749, Rotation2d.fromDegrees(10.0))};
    private static final Pose2d[] START_SWEEP    = { p(5.918, 0.736, 100.0), p(7.538, 1.049, 100), p(7.721, 1.716, 100) };
    private static final Pose2d[] SWEEP          = { p(7.721, 1.716, 100), p(7.819, 3.320, 100) };
    private static final Pose2d[] TURN           = { p(7.819, 3.320, 180), p(7.420, 2.706, 180) };
    private static final Pose2d[] CONNECTOR      = { p(7.420, 2.706, -150), p(1.526, 2.395, -150) };
    private static final Pose2d[] BACK_TO_TRENCH = { p(1.526, 2.395, 0), p(2.578, 1.394, 0), p(2.875, 0.767, 0) };
    private static final Pose2d test = new Pose2d(0.672,0.841, Rotation2d.fromDegrees(-30.3));
    Command keepIntakeUp()       { return manager.setModeCommand(RobotState.STOW_INTAKE_IN); }
    Command waitForBumpIntake()  { return manager.setModeCommand(RobotState.INTAKING); }
    Command waitForBumpPrepShoot() { return manager.setModeCommand(RobotState.DYNAMIC_PREPARE_SHOOT); }

    @Override
    public Command getAutoCommand() {
        FollowConstraints underTrench  = new FollowConstraints(3.5, 0.5);
        FollowConstraints startSweep   = new FollowConstraints(3.5, Units.inchesToMeters(20));
        FollowConstraints sweepHub     = new FollowConstraints(2.75, Units.inchesToMeters(12));
        FollowConstraints turn         = new FollowConstraints(2.25, Units.inchesToMeters(6));
        FollowConstraints connector    = new FollowConstraints(3.5, Units.inchesToMeters(6));
        FollowConstraints backToTrench = new FollowConstraints(2.0, Units.inchesToMeters(6));

        startSweep.maxRotateVelocity = 6.0;
        connector.maxRotateVelocity  = 3.5;

        return sequence(
            keepIntakeUp(),
            waitSeconds(4),
            waitForBumpIntake(),
            drive(underTrench,  true,  UNDER_TRENCH),
            drive(startSweep,   true,  START_SWEEP),
            drive(sweepHub,     true,  SWEEP),
            drive(turn,         true,  TURN),
            drive(connector,    true,  CONNECTOR),
            waitForBumpPrepShoot(),
            waitUntil(() -> manager.intake.isIntakeStowed() &&
                manager.intake.state == IntakeState.INTAKE_WHILE_SHOOTING).withTimeout(4),
            manager.setModeCommand(RobotState.BACKING_UP),
            waitSeconds(0.9408 / 2),
            manager.setModeCommand(RobotState.STOW_INTAKE_IN),
            manager.setModeCommand(RobotState.OUTTAKING),
            waitUntil(() -> manager.intake.isIntakeDown() &&
                manager.intake.state == IntakeState.OUTTAKE).withTimeout(2.5),
            manager.setModeCommand(RobotState.INTAKING)
        );
    }
}
